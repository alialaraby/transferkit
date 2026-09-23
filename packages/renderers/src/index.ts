import { packageName as corePackageName } from "@transferkit/core";
import type {
  HandoverAuditResult,
  HandoverState,
  OnboardingPlan,
  OnboardingProgressState,
  OwnershipReadinessEvidence,
} from "@transferkit/core";
import { sanitizeHandoverValue } from "./handover-package.js";

export const packageName = "@transferkit/renderers";
export const dependencies = [corePackageName] as const;

export {
  renderHandoverPackage,
  renderSingleFileHandover,
  sanitizeHandoverValue,
  type HandoverDocument,
} from "./handover-package.js";

export function renderHandoverAudit(result: HandoverAuditResult): string {
  if (result.entities.length === 0) {
    return `${result.category}\n\n${result.category === "Messaging" ? "No messaging consumers found." : "No auditable handover entities found."}`;
  }

  return [
    result.category,
    ...result.entities.flatMap((entity) => [
      "",
      entity.entityName,
      "",
      ...entity.requirements.map((requirement) => {
        if (requirement.status === "satisfied") return `✓ ${requirement.title}`;
        if (requirement.status === "skipped") {
          return `– ${requirement.title} (skipped)`;
        }
        return `✗ ${requirement.title}`;
      }),
      "",
      `${entity.criticalComplete} / ${entity.criticalTotal} critical requirements complete`,
    ]),
  ].join("\n");
}

export function renderOnboardingPlan(plan: OnboardingPlan): string {
  if (plan.stages.length === 0)
    return "Onboarding Plan\n\nNo repository-specific onboarding tasks found.";
  const lines = [
    "Onboarding Plan",
    "",
    plan.knowledgeMode === "repository-only"
      ? "Knowledge source: repository only; human handover knowledge is unknown."
      : "Knowledge source: repository and human handover.",
  ];
  for (const stage of plan.stages) {
    lines.push("", stage.title, "");
    for (const task of stage.tasks) {
      lines.push(
        `[ ] ${sanitizeHandoverValue(task.title)}${task.description === undefined ? "" : ` — ${sanitizeHandoverValue(task.description)}`}`,
      );
    }
  }
  if (plan.missingInformation.length > 0) {
    lines.push("", "Missing handover information", "");
    lines.push(
      ...plan.missingInformation.map(
        ({ message }) => `⚠ ${sanitizeHandoverValue(message)}`,
      ),
    );
  }
  return lines.join("\n");
}

export function renderOnboardingStatus(
  plan: OnboardingPlan,
  progress: OnboardingProgressState,
  readiness: OwnershipReadinessEvidence,
): string {
  const progressById = new Map(
    progress.tasks.map((task) => [task.taskId, task]),
  );
  const lines = plan.stages.map((stage) => {
    const done = stage.tasks.filter(({ id }) => {
      const status = progressById.get(id)?.status;
      return status === "completed" || status === "skipped";
    }).length;
    return `${stage.title.padEnd(23)} ${done}/${stage.tasks.length}`;
  });
  const next = plan.stages
    .flatMap(({ tasks }) => tasks)
    .find(({ id }) => {
      const status = progressById.get(id)?.status ?? "not-started";
      return status === "in-progress" || status === "not-started";
    });
  if (next !== undefined)
    lines.push(
      "",
      `Next: ${sanitizeHandoverValue(next.title)} (${sanitizeHandoverValue(next.id)})`,
    );
  else if (lines.length > 0)
    lines.push("", "All onboarding tasks are complete or skipped.");
  if (readiness.items.length > 0) {
    lines.push("", "Ownership-readiness evidence", "");
    lines.push(
      ...readiness.items.map(
        ({ status, statement }) =>
          `${evidenceMarker(status)} ${sanitizeHandoverValue(statement)}`,
      ),
    );
  }
  return lines.length === 0
    ? "No repository-specific onboarding tasks found."
    : lines.join("\n");
}

function evidenceMarker(
  status: OwnershipReadinessEvidence["items"][number]["status"],
): string {
  if (status === "confirmed") return "✓";
  if (status === "skipped") return "–";
  if (status === "unknown") return "?";
  return "✗";
}

export function renderMessagingMarkdown(
  state: HandoverState,
  audit: HandoverAuditResult,
): string {
  const lines = ["# Messaging", ""];
  if (audit.entities.length === 0) {
    return `${lines.join("\n")}No messaging consumers found.\n`;
  }

  for (const result of audit.entities) {
    const entity = state.entities.find(({ id }) => id === result.entityId);
    if (entity === undefined) continue;
    lines.push(`## ${entity.name}`, "");
    appendField(lines, "Technology", entity.technology);
    appendField(lines, "Queue", entity.queue);
    appendField(lines, "Exchange", entity.exchange);
    appendField(lines, "Routing key", entity.routingKey);
    appendField(lines, "Handler", entity.handler);
    for (const requirement of result.requirements) {
      const entry = state.knowledge.find(
        ({ entityId, field }) =>
          entityId === entity.id && field === requirement.field,
      );
      const value =
        requirement.status === "satisfied" ? entry?.value : undefined;
      appendField(
        lines,
        requirement.title,
        typeof value === "string" && value.trim().length > 0
          ? sanitizeHandoverValue(value)
          : undefined,
        requirement.status === "skipped" ? "Missing (skipped)" : "Missing",
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function appendField(
  lines: string[],
  label: string,
  value: string | undefined,
  missing = "Missing",
): void {
  lines.push(
    `- **${label}:** ${value === undefined ? `_${missing}_` : sanitizeHandoverValue(value)}`,
  );
}
