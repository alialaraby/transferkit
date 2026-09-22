import type { KnowledgeRequirement, RequirementPriority } from "./index.js";

export interface KnowledgeEntity<TKind extends string = string> {
  id: string;
  kind: TKind;
}

export interface KnowledgeEntry<
  TField extends string = string,
  TValue = unknown,
> {
  entityId: string;
  field: TField;
  value: TValue;
}

export interface KnowledgeGap<
  TField extends string = string,
  TPriority extends RequirementPriority = RequirementPriority,
> {
  requirementId: string;
  entityId: string;
  field: TField;
  priority: TPriority;
}

export function detectKnowledgeGaps<TField extends string>(
  entities: readonly KnowledgeEntity[],
  knowledgeEntries: readonly KnowledgeEntry[],
  requirements: readonly KnowledgeRequirement<string, TField>[],
): KnowledgeGap<TField>[] {
  const completedFields = new Set(
    knowledgeEntries.map(({ entityId, field }) => `${entityId}\u0000${field}`),
  );
  const gaps: KnowledgeGap<TField>[] = [];

  for (const entity of entities) {
    for (const requirement of requirements) {
      if (
        requirement.entityKind === entity.kind &&
        !completedFields.has(`${entity.id}\u0000${requirement.field}`)
      ) {
        gaps.push({
          requirementId: requirement.id,
          entityId: entity.id,
          field: requirement.field,
          priority: requirement.priority,
        });
      }
    }
  }

  return gaps;
}
