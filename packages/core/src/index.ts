export const packageName = "@transferkit/core";

export * from "./handover-state.js";
export * from "./interview.js";
export * from "./knowledge-gaps.js";

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
