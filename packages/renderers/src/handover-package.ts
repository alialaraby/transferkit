import type {
  EntityAuditResult,
  HandoverAuditResult,
  HandoverEntity,
  HandoverState,
} from "@transferkit/core";
import { redactLikelySecrets } from "@transferkit/core";

export interface HandoverDocument {
  fileName: string;
  contents: string;
}

const labels: Record<HandoverEntity["kind"], string> = {
  "messaging.consumer": "Messaging consumers",
  "scheduled-job": "Scheduled jobs",
  database: "Databases",
  integration: "External integrations",
  configuration: "Runtime configuration",
  containerization: "Containers",
  "ci.workflow": "CI/CD workflows",
};

export function renderHandoverPackage(
  state: HandoverState,
  audit: HandoverAuditResult,
  messagingMarkdown?: string,
): HandoverDocument[] {
  if (state.entities.length === 0) return [];

  const documents: HandoverDocument[] = [renderOverview(state)];
  if (new Set(state.entities.map(({ kind }) => kind)).size > 1) {
    documents.push(renderArchitecture(state));
  }
  addDomainDocument(documents, state, audit, "data.md", "Data", ["database"]);
  if (
    state.entities.some(({ kind }) => kind === "messaging.consumer") &&
    messagingMarkdown
  ) {
    documents.push({ fileName: "messaging.md", contents: messagingMarkdown });
  }
  addDomainDocument(
    documents,
    state,
    audit,
    "integrations.md",
    "External Integrations",
    ["integration"],
  );
  addDomainDocument(documents, state, audit, "operations.md", "Operations", [
    "scheduled-job",
    "configuration",
  ]);
  addDomainDocument(documents, state, audit, "deployment.md", "Deployment", [
    "containerization",
    "ci.workflow",
  ]);

  const ownership = renderOwnership(state, audit);
  if (ownership) documents.push(ownership);
  const risks = renderRisks(state, audit);
  if (risks) documents.push(risks);
  return documents;
}

export function renderSingleFileHandover(
  documents: readonly HandoverDocument[],
): string {
  if (documents.length === 0) {
    return "# Handover\n\nNo supported capabilities have been discovered.\n";
  }
  return (
    documents.map(({ contents }) => contents.trimEnd()).join("\n\n---\n\n") +
    "\n"
  );
}

function renderOverview(state: HandoverState): HandoverDocument {
  const counts = new Map<HandoverEntity["kind"], number>();
  for (const entity of state.entities)
    counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);
  const lines = ["# System Overview", "", "## Discovered capabilities", ""];
  for (const [kind, count] of counts)
    lines.push(`- **${labels[kind]}:** ${count}`);
  return document("overview.md", lines);
}

function renderArchitecture(state: HandoverState): HandoverDocument {
  const lines = ["# Architecture", "", "## System components", ""];
  for (const entity of state.entities) {
    lines.push(
      `- **${entity.name}** — ${labels[entity.kind]}${entity.technology ? ` (${entity.technology})` : ""}`,
    );
  }
  return document("architecture.md", lines);
}

function addDomainDocument(
  documents: HandoverDocument[],
  state: HandoverState,
  audit: HandoverAuditResult,
  fileName: string,
  title: string,
  kinds: HandoverEntity["kind"][],
): void {
  const entities = state.entities.filter(({ kind }) => kinds.includes(kind));
  if (entities.length === 0) return;
  const lines = [`# ${title}`, ""];
  for (const entity of entities) appendEntity(lines, entity, state, audit);
  documents.push(document(fileName, lines));
}

function appendEntity(
  lines: string[],
  entity: HandoverEntity,
  state: HandoverState,
  audit: HandoverAuditResult,
): void {
  lines.push(`## ${entity.name}`, "");
  appendKnownFact(lines, "Technology", entity.technology);
  appendKnownFact(lines, "Handler", entity.handler);
  appendKnownFact(lines, "Schedule type", entity.scheduleType);
  appendKnownFact(
    lines,
    "Schedule",
    entity.schedule === undefined ? undefined : String(entity.schedule),
  );
  appendKnownFact(lines, "Endpoint", entity.endpoint);
  const result = audit.entities.find(({ entityId }) => entityId === entity.id);
  if (result) appendKnowledge(lines, entity.id, result, state.knowledge);
  lines.push("");
}

function appendKnowledge(
  lines: string[],
  entityId: string,
  result: EntityAuditResult,
  knowledge: HandoverState["knowledge"],
): void {
  for (const requirement of result.requirements) {
    const entry = knowledge.find(
      (item) => item.entityId === entityId && item.field === requirement.field,
    );
    if (requirement.status === "satisfied" && entry) {
      appendFact(lines, requirement.title, sanitizeHandoverValue(entry.value));
    } else if (requirement.priority === "critical") {
      appendFact(
        lines,
        requirement.title,
        undefined,
        requirement.status === "skipped"
          ? "Missing critical (skipped)"
          : "Missing critical",
      );
    }
  }
}

function renderOwnership(
  state: HandoverState,
  audit: HandoverAuditResult,
): HandoverDocument | undefined {
  const lines = ["# Ownership", ""];
  for (const result of audit.entities) {
    const entity = state.entities.find(({ id }) => id === result.entityId);
    if (!entity) continue;
    for (const requirement of result.requirements.filter(({ field }) =>
      /owner$/iu.test(field),
    )) {
      const entry = state.knowledge.find(
        ({ entityId, field }) =>
          entityId === entity.id && field === requirement.field,
      );
      lines.push(
        `- **${entity.name}:** ${entry && requirement.status === "satisfied" ? sanitizeHandoverValue(entry.value) : requirement.priority === "critical" ? "_Missing critical_" : "_Missing_"}`,
      );
    }
  }
  return lines.length === 2 ? undefined : document("ownership.md", lines);
}

function renderRisks(
  state: HandoverState,
  audit: HandoverAuditResult,
): HandoverDocument | undefined {
  const lines = ["# Risks and Missing Knowledge", ""];
  for (const result of audit.entities) {
    const entity = state.entities.find(({ id }) => id === result.entityId);
    if (!entity) continue;
    const missing = result.requirements.filter(
      ({ priority, status }) =>
        priority === "critical" && status !== "satisfied",
    );
    if (missing.length > 0) {
      lines.push(
        `- **${entity.name}:** Missing ${missing
          .map(
            ({ title, status }) =>
              `${title.toLowerCase()}${status === "skipped" ? " (deferred)" : ""}`,
          )
          .join(", ")}.`,
      );
    }
  }
  return lines.length === 2 ? undefined : document("risks.md", lines);
}

function appendFact(
  lines: string[],
  label: string,
  value?: string,
  missing = "Missing",
): void {
  if (value === undefined || value.trim().length === 0)
    lines.push(`- **${label}:** _${missing}_`);
  else lines.push(`- **${label}:** ${value}`);
}

function appendKnownFact(lines: string[], label: string, value?: string): void {
  if (value !== undefined && value.trim().length > 0)
    lines.push(`- **${label}:** ${sanitizeHandoverValue(value)}`);
}

export function sanitizeHandoverValue(value: unknown): string {
  if (typeof value !== "string") return "_Missing_";
  return redactLikelySecrets(value);
}

function document(fileName: string, lines: string[]): HandoverDocument {
  return { fileName, contents: `${lines.join("\n").trimEnd()}\n` };
}
