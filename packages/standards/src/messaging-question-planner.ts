import type { InterviewQuestion, KnowledgeGap } from "@transferkit/core";

import type { MessagingConsumerKnowledgeField } from "./index.js";

type MessagingGap = KnowledgeGap<MessagingConsumerKnowledgeField>;

const priorityOrder = { critical: 0, recommended: 1, optional: 2 } as const;
const fieldOrder: Record<MessagingConsumerKnowledgeField, number> = {
  criticality: 0,
  failureBehavior: 1,
  recoveryProcedure: 2,
  operationalOwner: 3,
};

export function planMessagingInterviewQuestions(
  gaps: readonly MessagingGap[],
): InterviewQuestion[] {
  const entityIds = [...new Set(gaps.map(({ entityId }) => entityId))].sort();
  const questions: InterviewQuestion[] = [];

  for (const entityId of entityIds) {
    const entityGaps = gaps
      .filter((gap) => gap.entityId === entityId)
      .sort(
        (left, right) =>
          priorityOrder[left.priority] - priorityOrder[right.priority] ||
          fieldOrder[left.field] - fieldOrder[right.field],
      );

    addQuestion(
      questions,
      entityId,
      entityGaps,
      ["criticality"],
      "criticality",
      "How critical is this consumer?",
      "select",
      ["critical", "important", "routine"],
    );
    addQuestion(
      questions,
      entityId,
      entityGaps,
      ["failureBehavior", "recoveryProcedure"],
      "failure-and-recovery",
      "What happens when this consumer fails, and how is it normally recovered or replayed?",
      "text",
    );
    addQuestion(
      questions,
      entityId,
      entityGaps,
      ["operationalOwner"],
      "operational-owner",
      "Who is the operational owner for this consumer?",
      "text",
    );
  }

  return questions.sort((left, right) => {
    const leftPriority = questionPriority(left, gaps);
    const rightPriority = questionPriority(right, gaps);
    return leftPriority - rightPriority;
  });
}

function addQuestion(
  questions: InterviewQuestion[],
  entityId: string,
  gaps: readonly MessagingGap[],
  fields: readonly MessagingConsumerKnowledgeField[],
  questionKey: string,
  prompt: string,
  type: InterviewQuestion["type"],
  choices?: string[],
): void {
  const coveredGaps = gaps.filter(({ field }) => fields.includes(field));
  if (coveredGaps.length === 0) return;

  questions.push({
    id: `messaging.consumer.${questionKey}:${entityId}`,
    targetEntityId: entityId,
    prompt,
    requirementIds: coveredGaps.map(({ requirementId }) => requirementId),
    type,
    ...(choices === undefined ? {} : { choices }),
  });
}

function questionPriority(
  question: InterviewQuestion,
  gaps: readonly MessagingGap[],
): number {
  return Math.min(
    ...gaps
      .filter(
        ({ entityId, requirementId }) =>
          entityId === question.targetEntityId &&
          question.requirementIds.includes(requirementId),
      )
      .map(({ priority }) => priorityOrder[priority]),
  );
}
