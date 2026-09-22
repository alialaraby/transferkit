import type {
  HandoverEntity,
  HandoverState,
  KnowledgeRequirement,
  MissingOnboardingInformation,
  OnboardingPlan,
  OnboardingStage,
  OnboardingStageId,
  OnboardingTask,
} from "@transferkit/core";
import { onboardingStageOrder } from "@transferkit/core";

import {
  handoverRequirements,
  type HandoverKnowledgeField,
} from "./handover-standard.js";

const stageTitles: Record<OnboardingStageId, string> = {
  "understand-why": "Understand Why",
  "understand-system": "Understand the System",
  "run-it": "Run It",
  "trace-it": "Trace It",
  "operate-it": "Operate It",
  "change-it": "Change It",
  "own-it": "Own It",
};

export interface OnboardingPlanOptions {
  handoverAvailable?: boolean;
}

export function planOnboarding(
  state: HandoverState,
  options: OnboardingPlanOptions = {},
): OnboardingPlan {
  const tasks = state.entities.flatMap(repositoryTasks);
  const handoverAvailable =
    options.handoverAvailable ?? state.knowledge.length > 0;
  if (handoverAvailable) tasks.push(...knowledgeTasks(state));
  return {
    knowledgeMode: handoverAvailable ? "handover-aware" : "repository-only",
    stages: onboardingStageOrder.flatMap((id): OnboardingStage[] => {
      const stageTasks = tasks.filter((task) => task.stage === id);
      return stageTasks.length === 0
        ? []
        : [{ id, title: stageTitles[id], tasks: stageTasks }];
    }),
    missingInformation: handoverAvailable
      ? missingCriticalInformation(state)
      : [],
  };
}

function repositoryTasks(entity: HandoverEntity): OnboardingTask[] {
  switch (entity.kind) {
    case "messaging.consumer":
      return [
        task(
          entity,
          "understand-system",
          "locate",
          `Locate the ${displayTechnology(entity.technology)} consumer \`${entity.name}\``,
          entity.handler === undefined
            ? undefined
            : `Start at handler \`${entity.handler}\`.`,
        ),
        task(
          entity,
          "trace-it",
          "routing-flow",
          entity.routingKey === undefined
            ? `Trace the routing flow for \`${entity.name}\``
            : `Trace the \`${entity.routingKey}\` routing flow`,
          routingDescription(entity),
        ),
      ];
    case "scheduled-job":
      return [
        task(
          entity,
          "trace-it",
          "scheduled-job",
          `Review scheduled job \`${entity.name}\``,
          scheduleDescription(entity),
        ),
      ];
    case "database":
      return [
        task(
          entity,
          "understand-system",
          "data-layer",
          `Review ${entity.technology ?? entity.name} data layer`,
        ),
      ];
    case "integration":
      return [
        task(
          entity,
          "trace-it",
          "integration",
          `Trace the \`${entity.name}\` integration`,
          entity.endpoint === undefined
            ? undefined
            : `Review calls to \`${entity.endpoint}\`.`,
        ),
      ];
    case "configuration":
      return [
        task(
          entity,
          "run-it",
          "runtime-configuration",
          "Review detected runtime configuration",
        ),
      ];
    case "containerization":
      return [
        task(
          entity,
          "run-it",
          "runtime-setup",
          `Inspect ${entity.technology ?? entity.name}/runtime setup`,
        ),
      ];
    case "ci.workflow":
      return [
        task(
          entity,
          "change-it",
          "ci-workflow",
          `Review detected ${entity.technology ?? "CI"} \`${entity.name}\` workflow`,
        ),
      ];
  }
}

function knowledgeTasks(state: HandoverState): OnboardingTask[] {
  const entities = new Map(state.entities.map((entity) => [entity.id, entity]));
  return state.knowledge.flatMap((entry): OnboardingTask[] => {
    if (entry.status === "skipped" || entry.value.trim().length === 0)
      return [];
    const entity = entities.get(entry.entityId);
    const requirement = requirementFor(entity, entry.field);
    if (entity === undefined || requirement === undefined) return [];
    const stage = stageForKnowledge(entry.field as HandoverKnowledgeField);
    return [
      task(
        entity,
        stage,
        `handover-${entry.field}`,
        `Review documented ${requirement.title.toLowerCase()} for \`${entity.name}\``,
        entry.value,
      ),
    ];
  });
}

function missingCriticalInformation(
  state: HandoverState,
): MissingOnboardingInformation[] {
  return state.entities.flatMap((entity) =>
    handoverRequirements.flatMap((requirement) => {
      if (
        requirement.entityKind !== entity.kind ||
        requirement.priority !== "critical"
      )
        return [];
      const entry = state.knowledge.find(
        (candidate) =>
          candidate.entityId === entity.id &&
          candidate.field === requirement.field,
      );
      if (
        entry !== undefined &&
        entry.status !== "skipped" &&
        entry.value.trim().length > 0
      )
        return [];
      return [
        {
          id: `missing:${requirement.id}:${entity.id}`,
          relatedEntityId: entity.id,
          message: `${requirement.title} for ${entity.name} was not documented during handover.`,
        },
      ];
    }),
  );
}

function requirementFor(
  entity: HandoverEntity | undefined,
  field: string,
): KnowledgeRequirement | undefined {
  return entity === undefined
    ? undefined
    : handoverRequirements.find(
        (candidate) =>
          candidate.entityKind === entity.kind && candidate.field === field,
      );
}

function stageForKnowledge(field: HandoverKnowledgeField): OnboardingStageId {
  if (field === "criticality" || field === "businessImportance")
    return "understand-why";
  if (field === "criticalData") return "understand-system";
  if (
    field === "environmentDifferences" ||
    field === "requiredConfiguration" ||
    field === "sandboxAvailability"
  )
    return "run-it";
  if (
    field === "migrationRisks" ||
    field === "deploymentProcess" ||
    field === "deliveryCaveats"
  )
    return "change-it";
  if (
    field === "operationalOwner" ||
    field === "dataOwner" ||
    field === "externalOwner" ||
    field === "configurationOwner" ||
    field === "deploymentOwner"
  )
    return "own-it";
  return "operate-it";
}

function task(
  entity: HandoverEntity,
  stage: OnboardingStageId,
  kind: string,
  title: string,
  description?: string,
): OnboardingTask {
  return {
    id: `${stage}:${kind}:${entity.id}`,
    stage,
    title,
    ...(description === undefined ? {} : { description }),
    relatedEntityId: entity.id,
  };
}

function displayTechnology(technology: string | undefined): string {
  if (technology === undefined) return "messaging";
  return technology.toLowerCase() === "rabbitmq" ? "RabbitMQ" : technology;
}

function routingDescription(entity: HandoverEntity): string | undefined {
  const parts = [
    entity.exchange === undefined
      ? undefined
      : `exchange \`${entity.exchange}\``,
    entity.queue === undefined ? undefined : `queue \`${entity.queue}\``,
  ].filter((value): value is string => value !== undefined);
  return parts.length === 0 ? undefined : `Follow ${parts.join(" to ")}.`;
}

function scheduleDescription(entity: HandoverEntity): string | undefined {
  const parts = [
    entity.handler === undefined ? undefined : `handler \`${entity.handler}\``,
    entity.schedule === undefined
      ? undefined
      : `${entity.scheduleType ?? "schedule"} \`${entity.schedule}\``,
  ].filter((value): value is string => value !== undefined);
  return parts.length === 0 ? undefined : parts.join(", ");
}
