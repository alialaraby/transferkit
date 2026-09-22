import { describe, expect, it } from "vitest";

import type { KnowledgeGap } from "@transferkit/core";

import {
  messagingConsumerRequirements,
  planMessagingInterviewQuestions,
  type MessagingConsumerKnowledgeField,
} from "./index.js";

const entityId = "messaging.consumer:shipments";
const allGaps: KnowledgeGap<MessagingConsumerKnowledgeField>[] =
  messagingConsumerRequirements.map(({ id, field, priority }) => ({
    requirementId: id,
    entityId,
    field,
    priority,
  }));

describe("planMessagingInterviewQuestions", () => {
  it("groups related gaps into three questions", () => {
    const questions = planMessagingInterviewQuestions(allGaps);

    expect(questions).toHaveLength(3);
    expect(questions[1]?.requirementIds).toEqual([
      "messaging.consumer.failure-behavior",
      "messaging.consumer.recovery",
    ]);
  });

  it("represents criticality as a concise select question", () => {
    expect(planMessagingInterviewQuestions(allGaps)[0]).toMatchObject({
      prompt: "How critical is this consumer?",
      type: "select",
      choices: ["critical", "important", "routine"],
      requirementIds: ["messaging.consumer.criticality"],
    });
  });

  it("produces stable question IDs independent of gap order", () => {
    const first = planMessagingInterviewQuestions(allGaps).map(({ id }) => id);
    const second = planMessagingInterviewQuestions([...allGaps].reverse()).map(
      ({ id }) => id,
    );

    expect(first).toEqual(second);
    expect(first).toEqual([
      `messaging.consumer.criticality:${entityId}`,
      `messaging.consumer.failure-and-recovery:${entityId}`,
      `messaging.consumer.operational-owner:${entityId}`,
    ]);
  });
});
