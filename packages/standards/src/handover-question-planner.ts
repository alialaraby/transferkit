import type {
  HandoverEntity,
  InterviewQuestion,
  KnowledgeGap,
} from "@transferkit/core";

import type { HandoverKnowledgeField } from "./handover-standard.js";

interface QuestionGroup {
  key: string;
  fields: HandoverKnowledgeField[];
  prompt: string;
  type?: InterviewQuestion["type"];
  choices?: string[];
}

const groups: Record<HandoverEntity["kind"], QuestionGroup[]> = {
  "messaging.consumer": [
    {
      key: "criticality",
      fields: ["criticality"],
      prompt: "How critical is this consumer?",
      type: "select",
      choices: ["critical", "important", "routine"],
    },
    {
      key: "failure-recovery",
      fields: ["failureBehavior", "recoveryProcedure"],
      prompt:
        "What happens if this consumer fails, and how is it safely recovered or replayed?",
    },
    {
      key: "owner",
      fields: ["operationalOwner"],
      prompt: "Who operationally owns this consumer?",
    },
  ],
  "scheduled-job": [
    {
      key: "impact",
      fields: ["criticality", "failureBehavior"],
      prompt:
        "How business-critical is this job, and what is the impact if it fails?",
    },
    {
      key: "recovery",
      fields: ["recoveryProcedure", "concurrencyConcerns"],
      prompt:
        "How can this job be safely rerun or recovered, including overlap or concurrency concerns?",
    },
    {
      key: "owner",
      fields: ["operationalOwner"],
      prompt: "Who operationally owns this scheduled job?",
    },
  ],
  database: [
    {
      key: "critical-data",
      fields: ["criticalData"],
      prompt: "Which data or tables are business-critical?",
    },
    {
      key: "migration-recovery",
      fields: ["migrationRisks", "dataRecovery"],
      prompt:
        "What dangerous or manual migration steps and backup/recovery risks must operators know?",
    },
    { key: "owner", fields: ["dataOwner"], prompt: "Who owns this data?" },
  ],
  integration: [
    {
      key: "importance-failure",
      fields: ["businessImportance", "failureBehavior"],
      prompt:
        "Why is this integration important, and what happens when it fails?",
    },
    {
      key: "ownership-credentials",
      fields: ["externalOwner", "credentialLifecycle"],
      prompt:
        "Who owns the external relationship, and how are credentials rotated?",
    },
    {
      key: "sandbox",
      fields: ["sandboxAvailability"],
      prompt: "Is a safe sandbox or test environment available?",
    },
  ],
  configuration: [
    {
      key: "differences-required",
      fields: ["environmentDifferences", "requiredConfiguration"],
      prompt:
        "What important environment differences or undocumented required configuration must maintainers know?",
    },
    {
      key: "owner",
      fields: ["configurationOwner"],
      prompt: "Who owns runtime configuration?",
    },
  ],
  containerization: deliveryGroups(),
  "ci.workflow": deliveryGroups(),
};

export function planHandoverInterviewQuestions(
  gaps: readonly KnowledgeGap<HandoverKnowledgeField>[],
  entities: readonly HandoverEntity[],
): InterviewQuestion[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const questions: InterviewQuestion[] = [];
  const entityIds = [...new Set(gaps.map(({ entityId }) => entityId))].sort();
  for (const entityId of entityIds) {
    const entity = byId.get(entityId);
    if (!entity) continue;
    const entityGaps = gaps.filter((gap) => gap.entityId === entityId);
    for (const group of groups[entity.kind]) {
      const covered = entityGaps.filter(({ field }) =>
        group.fields.includes(field),
      );
      if (covered.length === 0) continue;
      questions.push({
        id: `${entity.kind}.${group.key}:${entity.id}`,
        targetEntityId: entity.id,
        prompt: `${entity.name}: ${group.prompt}`,
        requirementIds: covered.map(({ requirementId }) => requirementId),
        type: group.type ?? "text",
        ...(group.choices === undefined ? {} : { choices: group.choices }),
      });
    }
  }
  return questions;
}

function deliveryGroups(): QuestionGroup[] {
  return [
    {
      key: "deploy-rollback",
      fields: ["deploymentProcess", "rollbackProcedure"],
      prompt: "How is production deployed and rolled back?",
    },
    {
      key: "owner",
      fields: ["deploymentOwner"],
      prompt: "Who owns production deployment?",
    },
    {
      key: "caveats",
      fields: ["deliveryCaveats"],
      prompt:
        "What important CI/CD or deployment caveats are not evident from code?",
    },
  ];
}
