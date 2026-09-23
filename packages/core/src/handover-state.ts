import type { KnowledgeEntry } from "./knowledge-gaps.js";
import {
  currentSchemaVersion,
  requireCurrentSchemaVersion,
} from "./state-version.js";

export interface HandoverEntity {
  id: string;
  kind:
    | "messaging.consumer"
    | "scheduled-job"
    | "database"
    | "integration"
    | "configuration"
    | "containerization"
    | "ci.workflow";
  name: string;
  technology?: string;
  queue?: string;
  exchange?: string;
  routingKey?: string;
  handler?: string;
  scheduleType?: string;
  schedule?: string | number;
  endpoint?: string;
}

export interface HandoverState {
  schemaVersion: 1;
  entities: HandoverEntity[];
  knowledge: KnowledgeEntry<string, string>[];
}

export function createHandoverState(): HandoverState {
  return { schemaVersion: 1, entities: [], knowledge: [] };
}

export function parseHandoverState(contents: string): HandoverState {
  const value: unknown = parseJson(contents, "TransferKit handover state");
  requireCurrentSchemaVersion(value, "TransferKit handover state");
  if (!isHandoverState(value)) {
    throw new Error("Invalid TransferKit handover state");
  }
  return value;
}

export function migrateHandoverState(value: unknown): HandoverState {
  requireCurrentSchemaVersion(value, "TransferKit handover state");
  if (!isHandoverState(value))
    throw new Error("Invalid TransferKit handover state");
  return value;
}

export function serializeHandoverState(state: HandoverState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function isHandoverState(value: unknown): value is HandoverState {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === currentSchemaVersion &&
    Array.isArray(value.entities) &&
    value.entities.every(isHandoverEntity) &&
    Array.isArray(value.knowledge) &&
    value.knowledge.every(isKnowledgeEntry)
  );
}

function parseJson(contents: string, stateName: string): unknown {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`${stateName} is not valid JSON`);
  }
}

function isHandoverEntity(value: unknown): value is HandoverEntity {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isHandoverEntityKind(value.kind) &&
    typeof value.name === "string" &&
    isOptionalString(value.technology) &&
    isOptionalString(value.queue) &&
    isOptionalString(value.exchange) &&
    isOptionalString(value.routingKey) &&
    isOptionalString(value.handler) &&
    isOptionalString(value.scheduleType) &&
    (value.schedule === undefined ||
      typeof value.schedule === "string" ||
      typeof value.schedule === "number") &&
    isOptionalString(value.endpoint)
  );
}

function isHandoverEntityKind(value: unknown): value is HandoverEntity["kind"] {
  return (
    value === "messaging.consumer" ||
    value === "scheduled-job" ||
    value === "database" ||
    value === "integration" ||
    value === "configuration" ||
    value === "containerization" ||
    value === "ci.workflow"
  );
}

function isKnowledgeEntry(
  value: unknown,
): value is KnowledgeEntry<string, string> {
  return (
    isRecord(value) &&
    typeof value.entityId === "string" &&
    typeof value.field === "string" &&
    typeof value.value === "string" &&
    (value.status === undefined ||
      value.status === "answered" ||
      value.status === "skipped")
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
