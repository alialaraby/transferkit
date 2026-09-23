import {
  currentSchemaVersion,
  requireCurrentSchemaVersion,
} from "./state-version.js";

export const packageName = "@transferkit/core";

export * from "./handover-state.js";
export * from "./handover-audit.js";
export * from "./interview.js";
export * from "./knowledge-gaps.js";
export * from "./onboarding-plan.js";
export * from "./onboarding-progress.js";
export * from "./ownership-readiness.js";
export * from "./secret-protection.js";
export * from "./state-version.js";

export interface Evidence {
  file: string;
  line?: number;
  description?: string;
}

export interface Finding<TData = unknown, TKind extends string = string> {
  id: string;
  kind: TKind;
  data: TData;
  evidence: Evidence[];
}

export interface MessagingConsumer {
  id: string;
  kind: "messaging.consumer";
  name: string;
  technology: string;
  queue?: string;
  exchange?: string;
  routingKey?: string;
  handler: string;
  evidence: Evidence[];
}

export interface MessagingSystem {
  technology: string;
  consumers: MessagingConsumer[];
}

export type ScheduledJobType = "cron" | "interval" | "timeout";

export interface ScheduledJob {
  id: string;
  kind: "scheduled-job";
  name: string;
  handler: string;
  type: ScheduledJobType;
  schedule?: string | number;
  evidence: Evidence[];
}

export function buildMessagingSystems(
  consumers: readonly MessagingConsumer[],
): MessagingSystem[] {
  const systems = new Map<string, MessagingSystem>();

  for (const consumer of consumers) {
    const system = systems.get(consumer.technology);
    if (system === undefined) {
      systems.set(consumer.technology, {
        technology: consumer.technology,
        consumers: [consumer],
      });
    } else {
      system.consumers.push(consumer);
    }
  }

  return [...systems.values()];
}

export type RequirementPriority = "critical" | "recommended" | "optional";

export interface KnowledgeRequirement<
  TEntityKind extends string = string,
  TField extends string = string,
> {
  id: string;
  entityKind: TEntityKind;
  field: TField;
  title: string;
  priority: RequirementPriority;
}

export interface TransferKitProject {
  name: string;
  initializedAt: string;
}

export interface TransferKitProjectState {
  schemaVersion: 1;
  project: TransferKitProject;
}

export function createProjectState(
  projectName: string,
  initializedAt: Date,
): TransferKitProjectState {
  return {
    schemaVersion: 1,
    project: {
      name: projectName,
      initializedAt: initializedAt.toISOString(),
    },
  };
}

export function serializeProjectState(state: TransferKitProjectState): string {
  return [
    `schemaVersion: ${state.schemaVersion}`,
    "",
    "project:",
    `  name: ${JSON.stringify(state.project.name)}`,
    `  initializedAt: ${JSON.stringify(state.project.initializedAt)}`,
    "",
  ].join("\n");
}

export function parseProjectState(contents: string): TransferKitProjectState {
  const lines = contents.split(/\r?\n/u);
  const version = scalar(lines, "schemaVersion");
  const name = nestedScalar(lines, "project", "name");
  const initializedAt = nestedScalar(lines, "project", "initializedAt");
  const value: unknown = {
    schemaVersion: version === undefined ? undefined : Number(version),
    project: {
      name: jsonString(name),
      initializedAt: jsonString(initializedAt),
    },
  };
  return migrateProjectState(value);
}

export function migrateProjectState(value: unknown): TransferKitProjectState {
  requireCurrentSchemaVersion(value, "TransferKit project metadata");
  if (!isProjectState(value))
    throw new Error("Invalid TransferKit project metadata");
  return value;
}

function scalar(lines: readonly string[], key: string): string | undefined {
  return lines
    .find((line) => line.startsWith(`${key}:`))
    ?.slice(key.length + 1)
    .trim();
}

function nestedScalar(
  lines: readonly string[],
  parent: string,
  key: string,
): string | undefined {
  const parentIndex = lines.findIndex((line) => line === `${parent}:`);
  if (parentIndex < 0) return undefined;
  const prefix = `  ${key}:`;
  return lines
    .slice(parentIndex + 1)
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function jsonString(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isProjectState(value: unknown): value is TransferKitProjectState {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "schemaVersion" in value &&
    value.schemaVersion === currentSchemaVersion &&
    "project" in value &&
    typeof value.project === "object" &&
    value.project !== null &&
    !Array.isArray(value.project) &&
    "name" in value.project &&
    typeof value.project.name === "string" &&
    value.project.name.length > 0 &&
    "initializedAt" in value.project &&
    typeof value.project.initializedAt === "string" &&
    !Number.isNaN(Date.parse(value.project.initializedAt))
  );
}
