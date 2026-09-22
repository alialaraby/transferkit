import { packageName as corePackageName } from "@transferkit/core";
import type {
  HandoverAuditResult,
  HandoverState,
  MessagingOnboardingPlan,
} from "@transferkit/core";

export const packageName = "@transferkit/renderers";
export const dependencies = [corePackageName] as const;

export function renderHandoverAudit(result: HandoverAuditResult): string {
  if (result.entities.length === 0) {
    return `${result.category}\n\nNo messaging consumers found.`;
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

export function renderMessagingOnboardingPlan(
  plan: MessagingOnboardingPlan,
): string {
  if (plan.consumers.length === 0) {
    return `${plan.category}\n\nNo messaging consumers found.`;
  }

  return [
    plan.category,
    ...plan.consumers.flatMap((consumer) => [
      "",
      consumer.entityName,
      "",
      ...consumer.tasks.map(
        ({ title, detail }) =>
          `[ ] ${title}${detail === undefined ? "" : ` — ${detail}`}`,
      ),
    ]),
  ].join("\n");
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
          ? value
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
  lines.push(`- **${label}:** ${value ?? `_${missing}_`}`);
}
