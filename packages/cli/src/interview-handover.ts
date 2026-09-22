import {
  detectKnowledgeGaps,
  type HandoverState,
  type InterviewQuestion,
  type KnowledgeEntry,
} from "@transferkit/core";
import {
  messagingConsumerRequirements,
  planMessagingInterviewQuestions,
  type MessagingConsumerKnowledgeField,
} from "@transferkit/standards";

import { readHandoverState, writeHandoverState } from "./handover-state.js";

const maximumQuestionsPerRun = 4;

export interface InterviewIO {
  write: (message: string) => void;
  read: (prompt: string) => Promise<string>;
}

export type InterviewResult =
  | { status: "complete"; answered: number; skipped: number }
  | { status: "cancelled"; answered: number; skipped: number }
  | { status: "no-critical-gaps"; answered: 0; skipped: 0 };

export async function runHandoverInterview(
  workingDirectory: string,
  io: InterviewIO,
): Promise<InterviewResult> {
  let state = await readHandoverState(workingDirectory);
  const criticalGaps = detectKnowledgeGaps(
    state.entities,
    state.knowledge,
    messagingConsumerRequirements,
  ).filter(({ priority }) => priority === "critical");
  const questions = planMessagingInterviewQuestions(criticalGaps).slice(
    0,
    maximumQuestionsPerRun,
  );

  if (questions.length === 0) {
    io.write("No missing critical handover knowledge.");
    return { status: "no-critical-gaps", answered: 0, skipped: 0 };
  }

  io.write(
    questions.length === 1
      ? "1 question is needed."
      : `${questions.length} questions are needed.`,
  );
  io.write("Enter skip to defer a question, or cancel to save and exit.");
  let answered = 0;
  let skipped = 0;

  for (const [index, question] of questions.entries()) {
    io.write(`Question ${index + 1} of ${questions.length}`);
    io.write(formatQuestion(question));

    while (true) {
      const answer = (await io.read("> ")).trim();
      const command = answer.toLowerCase();
      if (
        command === "cancel" ||
        command === "save & exit" ||
        command === "save and exit"
      ) {
        io.write("Answers saved. Interview cancelled.");
        return { status: "cancelled", answered, skipped };
      }
      if (command === "skip" || answer.length === 0) {
        skipped += 1;
        break;
      }

      const normalizedAnswer = normalizeAnswer(question, answer);
      if (normalizedAnswer === undefined) {
        io.write("Choose a listed value or number, or enter skip or cancel.");
        continue;
      }

      state = addAnswer(state, question, normalizedAnswer);
      await writeHandoverState(workingDirectory, state);
      answered += 1;
      break;
    }
  }

  return { status: "complete", answered, skipped };
}

function formatQuestion(question: InterviewQuestion): string {
  if (question.type === "confirm") {
    return `${question.prompt} [yes/no]`;
  }
  if (question.type === "select" && question.choices !== undefined) {
    return `${question.prompt} ${question.choices
      .map((choice, index) => `${index + 1}) ${choice}`)
      .join("  ")}`;
  }
  return question.prompt;
}

function normalizeAnswer(
  question: InterviewQuestion,
  answer: string,
): string | undefined {
  if (question.type === "confirm") {
    const confirmation = answer.toLowerCase();
    if (confirmation === "yes" || confirmation === "y") return "yes";
    if (confirmation === "no" || confirmation === "n") return "no";
    return undefined;
  }
  if (question.type !== "select" || question.choices === undefined) {
    return answer;
  }
  const numericChoice = Number(answer);
  if (Number.isInteger(numericChoice)) {
    return question.choices[numericChoice - 1];
  }
  return question.choices.find(
    (choice) => choice.toLowerCase() === answer.toLowerCase(),
  );
}

function addAnswer(
  state: HandoverState,
  question: InterviewQuestion,
  answer: string,
): HandoverState {
  if (question.targetEntityId === undefined) return state;
  const requirementIds = new Set(question.requirementIds);
  const fields = messagingConsumerRequirements
    .filter(({ id }) => requirementIds.has(id))
    .map(({ field }) => field);
  const existingKeys = new Set(
    state.knowledge.map(({ entityId, field }) => `${entityId}\u0000${field}`),
  );
  const additions: KnowledgeEntry<MessagingConsumerKnowledgeField, string>[] =
    fields
      .filter(
        (field) =>
          !existingKeys.has(
            `${question.targetEntityId as string}\u0000${field}`,
          ),
      )
      .map((field) => ({
        entityId: question.targetEntityId as string,
        field,
        value: answer,
      }));

  return { ...state, knowledge: [...state.knowledge, ...additions] };
}
