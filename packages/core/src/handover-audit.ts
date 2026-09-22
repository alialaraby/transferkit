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
  category: "Messaging";
  entities: EntityAuditResult[];
}

export function auditMessagingKnowledge(
  state: HandoverState,
  requirements: readonly KnowledgeRequirement[],
): HandoverAuditResult {
  const entities = state.entities.filter(
    (entity): entity is HandoverEntity => entity.kind === "messaging.consumer",
  );

  return {
    category: "Messaging",
    entities: entities.map((entity) => {
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
      const critical = results.filter(
        ({ priority }) => priority === "critical",
      );
      return {
        entityId: entity.id,
        entityName: entity.name,
        requirements: results,
        criticalComplete: critical.filter(
          ({ status }) => status === "satisfied",
        ).length,
        criticalTotal: critical.length,
      };
    }),
  };
}
