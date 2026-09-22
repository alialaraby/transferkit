import type { HandoverEntity, HandoverState } from "./handover-state.js";
import type { KnowledgeRequirement, RequirementPriority } from "./index.js";

export type AuditRequirementStatus = "satisfied" | "missing" | "skipped";

export interface AuditRequirementResult {
  id: string;
  field: string;
  title: string;
  priority: RequirementPriority;
  status: AuditRequirementStatus;
}

export interface EntityAuditResult {
  entityId: string;
  entityName: string;
  requirements: AuditRequirementResult[];
  criticalComplete: number;
  criticalTotal: number;
}

export interface HandoverAuditResult {
  category: "Messaging" | "Handover";
  entities: EntityAuditResult[];
}

export function auditHandoverKnowledge(
  state: HandoverState,
  requirements: readonly KnowledgeRequirement[],
): HandoverAuditResult {
  return auditEntities("Handover", state.entities, state, requirements);
}

export function auditMessagingKnowledge(
  state: HandoverState,
  requirements: readonly KnowledgeRequirement[],
): HandoverAuditResult {
  const entities = state.entities.filter(
    (entity): entity is HandoverEntity => entity.kind === "messaging.consumer",
  );

  return auditEntities("Messaging", entities, state, requirements);
}

function auditEntities(
  category: HandoverAuditResult["category"],
  entities: readonly HandoverEntity[],
  state: HandoverState,
  requirements: readonly KnowledgeRequirement[],
): HandoverAuditResult {
  return {
    category,
    entities: entities.flatMap((entity) => {
      const results = requirements
        .filter(({ entityKind }) => entityKind === entity.kind)
        .map((requirement) => {
          const entry = state.knowledge.find(
            ({ entityId, field }) =>
              entityId === entity.id && field === requirement.field,
          );
          return {
            id: requirement.id,
            field: requirement.field,
            title: requirement.title,
            priority: requirement.priority,
            status:
              entry === undefined
                ? ("missing" as const)
                : entry.status === "skipped"
                  ? ("skipped" as const)
                  : ("satisfied" as const),
          };
        });
      if (results.length === 0) return [];
      const critical = results.filter(
        ({ priority }) => priority === "critical",
      );
      return [
        {
          entityId: entity.id,
          entityName: entity.name,
          requirements: results,
          criticalComplete: critical.filter(
            ({ status }) => status === "satisfied",
          ).length,
          criticalTotal: critical.length,
        },
      ];
    }),
  };
}
