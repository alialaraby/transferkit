import type {
  HandoverEntity,
  HandoverState,
  MessagingOnboardingPlan,
  OnboardingTask,
} from "@transferkit/core";

import {
  messagingConsumerRequirements,
  type MessagingConsumerKnowledgeField,
} from "./index.js";

export function planMessagingOnboarding(
  state: HandoverState,
): MessagingOnboardingPlan {
  return {
    category: "Messaging",
    consumers: state.entities
      .filter(
        (entity): entity is HandoverEntity =>
          entity.kind === "messaging.consumer",
      )
      .map((entity) => ({
        entityId: entity.id,
        entityName: entity.name,
        tasks: tasksForConsumer(state, entity),
      })),
  };
}

function tasksForConsumer(
  state: HandoverState,
  entity: HandoverEntity,
): OnboardingTask[] {
  const location = [
    entity.handler === undefined ? undefined : `handler: ${entity.handler}`,
    entity.technology === undefined
      ? undefined
      : `technology: ${entity.technology}`,
  ].filter((value): value is string => value !== undefined);
  const flow = [
    entity.queue === undefined ? undefined : `queue: ${entity.queue}`,
    entity.exchange === undefined ? undefined : `exchange: ${entity.exchange}`,
    entity.routingKey === undefined
      ? undefined
      : `routing key: ${entity.routingKey}`,
  ].filter((value): value is string => value !== undefined);

  return [
    task("Locate the consumer implementation", location.join(", ")),
    task("Understand the queue/exchange/routing-key flow", flow.join(", ")),
    knowledgeTask(state, entity.id, "criticality", "Review criticality"),
    knowledgeTask(
      state,
      entity.id,
      "failureBehavior",
      "Review failure behavior",
    ),
    knowledgeTask(
      state,
      entity.id,
      "recoveryProcedure",
      "Review or practice recovery/replay",
    ),
    knowledgeTask(
      state,
      entity.id,
      "operationalOwner",
      "Identify operational owner",
    ),
  ];
}

function knowledgeTask(
  state: HandoverState,
  entityId: string,
  field: MessagingConsumerKnowledgeField,
  title: string,
): OnboardingTask {
  const entry = state.knowledge.find(
    (candidate) => candidate.entityId === entityId && candidate.field === field,
  );
  if (
    entry === undefined ||
    entry.status === "skipped" ||
    entry.value.trim().length === 0
  ) {
    const requirement = messagingConsumerRequirements.find(
      (candidate) => candidate.field === field,
    );
    return {
      title,
      detail: `Missing handover knowledge: ${requirement?.title ?? field}`,
      missingKnowledge: true,
    };
  }
  return task(title, entry.value);
}

function task(title: string, detail: string): OnboardingTask {
  return detail.length === 0 ? { title } : { title, detail };
}
