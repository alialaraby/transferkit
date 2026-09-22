import {
  detectKnowledgeGaps,
  type HandoverState,
  type InterviewQuestion,
  type KnowledgeEntry,
} from "@transferkit/core";
import {
  handoverRequirements,
  planHandoverInterviewQuestions,
  type HandoverKnowledgeField,
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
    handoverRequirements,
  ).filter(({ priority }) => priority === "critical");
  const allQuestions = planHandoverInterviewQuestions(
    criticalGaps,
    state.entities,
  );
  const questions = allQuestions.slice(0, maximumQuestionsPerRun);
  io.write(
    `${allQuestions.length} critical ${allQuestions.length === 1 ? "question remains" : "questions remain"}.`,
  );
  let answered = 0;
  let skipped = 0;

  if (questions.length > 0) {
    io.write("Enter skip to defer a question, or cancel to save and exit.");
    if (!(await askQuestions(questions)))
      return { status: "cancelled", answered, skipped };
  }

  if (allQuestions.length > questions.length) {
    const remaining = allQuestions.length - questions.length;
    io.write(
      `${remaining} critical ${remaining === 1 ? "question remains" : "questions remain"}. Run the interview again to continue.`,
    );
    return { status: "complete", answered, skipped };
  }

  const optionalGaps = detectKnowledgeGaps(
    state.entities,
    state.knowledge,
    handoverRequirements,
  ).filter(({ priority }) => priority !== "critical");
  const optionalQuestions = planHandoverInterviewQuestions(
    optionalGaps,
    state.entities,
  );
  if (optionalQuestions.length === 0) {
    if (allQuestions.length === 0)
      io.write("No missing critical handover knowledge.");
    return allQuestions.length === 0
      ? { status: "no-critical-gaps", answered: 0, skipped: 0 }
      : { status: "complete", answered, skipped };
  }

  io.write(
    `${optionalQuestions.length} optional ${optionalQuestions.length === 1 ? "question remains" : "questions remain"}. Continue? [yes/no]`,
  );
  const continueAnswer = (await io.read("> ")).trim().toLowerCase();
  if (continueAnswer !== "yes" && continueAnswer !== "y") {
    io.write(
      "Optional questions deferred. Run the interview again to continue.",
    );
    return { status: "complete", answered, skipped };
  }
  io.write("Enter skip to defer a question, or cancel to save and exit.");
  const optionalSession = optionalQuestions.slice(0, maximumQuestionsPerRun);
  if (!(await askQuestions(optionalSession)))
    return { status: "cancelled", answered, skipped };
  const optionalRemaining = optionalQuestions.length - optionalSession.length;
  if (optionalRemaining > 0) {
    io.write(
      `${optionalRemaining} optional ${optionalRemaining === 1 ? "question remains" : "questions remain"}. Run the interview again to continue.`,
    );
  }
  return { status: "complete", answered, skipped };

  async function askQuestions(
    sessionQuestions: readonly InterviewQuestion[],
  ): Promise<boolean> {
    for (const [index, question] of sessionQuestions.entries()) {
      io.write(`Question ${index + 1} of ${sessionQuestions.length}`);
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
          return false;
        }
        if (command === "skip") {
          state = markSkipped(state, question);
          await writeHandoverState(workingDirectory, state);
          skipped += 1;
          break;
        }
        if (answer.length === 0) {
          io.write("Enter an answer, or explicitly enter skip or cancel.");
          continue;
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
    return true;
  }
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
  const fields = handoverRequirements
    .filter(({ id }) => requirementIds.has(id))
    .map(({ field }) => field);
  const existingKeys = new Set(
    state.knowledge
      .filter(({ status }) => status !== "skipped")
      .map(({ entityId, field }) => `${entityId}\u0000${field}`),
  );
  const additions: KnowledgeEntry<HandoverKnowledgeField, string>[] = fields
    .filter(
      (field) =>
        !existingKeys.has(`${question.targetEntityId as string}\u0000${field}`),
    )
    .map((field) => ({
      entityId: question.targetEntityId as string,
      field,
      value: answer,
    }));

  const answeredKeys = new Set(
    additions.map(({ entityId, field }) => `${entityId}\u0000${field}`),
  );
  return {
    ...state,
    knowledge: [
      ...state.knowledge.filter(
        ({ entityId, field }) => !answeredKeys.has(`${entityId}\u0000${field}`),
      ),
      ...additions,
    ],
  };
}

function markSkipped(
  state: HandoverState,
  question: InterviewQuestion,
): HandoverState {
  if (question.targetEntityId === undefined) return state;
  const requirementIds = new Set(question.requirementIds);
  const fields = handoverRequirements
    .filter(({ id }) => requirementIds.has(id))
    .map(({ field }) => field);
  const skippedKeys = new Set(
    fields.map((field) => `${question.targetEntityId as string}\u0000${field}`),
  );
  return {
    ...state,
    knowledge: [
      ...state.knowledge.filter(
        ({ entityId, field }) => !skippedKeys.has(`${entityId}\u0000${field}`),
      ),
      ...fields.map((field) => ({
        entityId: question.targetEntityId as string,
        field,
        value: "",
        status: "skipped" as const,
      })),
    ],
  };
}
