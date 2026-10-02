import type {
  PersonalOnboardingExercise,
  PersonalOnboardingExerciseId,
  OnboardingTaskStatus,
} from "@transferkit/core";
import { sanitizeHandoverValue } from "./handover-package.js";

export interface PersonalOnboardingView {
  exercises: readonly PersonalOnboardingExercise[];
  statuses: Record<PersonalOnboardingExerciseId, OnboardingTaskStatus>;
  questions: readonly string[];
  unknowns: readonly string[];
  syncNeeded: boolean;
  staleJourneys?: readonly string[];
}

export function renderPersonalOnboarding(
  exercises: readonly PersonalOnboardingExercise[],
): string {
  const lines = [
    "# Personal onboarding workspace",
    "",
    "Use the [shared guide](../ONBOARDING.md) to work through these exercises. Record what you saw, what you still need to ask, and where you found it.",
    "",
    "Check an objective when you consider it done, then run `tk onboard sync`. Progress is self-reported.",
    "",
  ];
  for (const [index, exercise] of exercises.entries()) {
    lines.push(
      `## ${index + 1}. ${exercise.title}`,
      `<!-- tk:onboard:exercise ${exercise.id} -->`,
      "",
      `- [ ] **Objective:** ${exercise.objective}`,
      `- **Read:** [${exercise.title} in the shared guide](../ONBOARDING.md#${exercise.guideSectionId})`,
      `- **Done when:** ${exercise.outcome}`,
      ...(exercise.linkedJourneys ?? []).map(
        (symbol) =>
          `<!-- tk:onboard:linked-journey ${encodeURIComponent(symbol)} -->`,
      ),
      "",
      "### Notes",
      "",
      "_What did you learn? What did you try?_",
      "",
      "### Questions",
      "",
      "_Add questions for a person or a runtime check._",
      "",
      "### Evidence",
      "",
      "_Add file references, commands tried, and results observed._",
      "",
    );
    if (exercise.id === "v2:attempt-local-run")
      lines.push(
        "### Attempt log",
        "",
        "Record only steps you actually tried. Keep credentials and environment values out of this file.",
        "",
        "| Date | Exact command or safe check | Observed result | Blocker |",
        "| --- | --- | --- | --- |",
        "|  |  |  |  |",
        "",
      );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderPersonalOnboardingPlan(
  view: PersonalOnboardingView,
): string {
  const lines = [
    "Onboarding plan",
    "Work through the shared guide and record your findings in .transferkit.local/ONBOARDING.md.",
    ...(view.syncNeeded
      ? ["Checkbox edits pending: run 'tk onboard sync'."]
      : []),
    ...(view.staleJourneys?.length
      ? [
          `Stale guide link: ${view.staleJourneys.join(", ")}. Keep your notes; inspect the current guide.`,
        ]
      : []),
    "",
  ];
  for (const [index, exercise] of view.exercises.entries()) {
    lines.push(
      `${index + 1}. ${exercise.title} [${view.statuses[exercise.id]}] (${exercise.id})`,
      `   Focus: ${exercise.objective}`,
      `   Goal: ${exercise.outcome}`,
      `   Read: ONBOARDING.md#${exercise.guideSectionId}`,
    );
  }
  lines.push(
    "",
    "Next: open .transferkit.local/ONBOARDING.md. Update a checkbox and run 'tk onboard sync', or use 'tk onboard task <v2-id> <status>'.",
  );
  return lines.join("\n");
}

export function renderPersonalOnboardingStatus(
  view: PersonalOnboardingView,
): string {
  const completed = view.exercises.filter(
    ({ id }) => view.statuses[id] === "completed",
  ).length;
  const next = view.exercises.find(
    ({ id }) => !["completed", "skipped"].includes(view.statuses[id]),
  );
  const lines = [
    "Onboarding progress",
    `${completed} / ${view.exercises.length} exercises complete (self-reported)`,
    ...(view.syncNeeded
      ? ["Checkbox edits pending: run 'tk onboard sync'."]
      : []),
    ...(view.staleJourneys?.length
      ? [
          `Stale guide link: ${view.staleJourneys.join(", ")}. Keep your notes; inspect the current guide.`,
        ]
      : []),
    "",
    ...view.exercises.map(
      ({ id, title }) => `- ${title}: ${view.statuses[id]} (${id})`,
    ),
    ...(next
      ? [
          "",
          `Next: ${next.title} — ${next.objective} Open .transferkit.local/ONBOARDING.md.`,
        ]
      : []),
    "",
    "Questions and unknowns",
  ];
  const questions = [
    ...view.questions.map((item) => `Personal: ${item}`),
    ...view.unknowns.map(
      (item) =>
        `Guide: ${item.replace(/^\*\*(?:Unknown|Runtime unverified):\*\* /u, "")}`,
    ),
  ];
  if (questions.length === 0)
    lines.push(
      "No personal questions recorded. Review ONBOARDING.md#unknowns.",
    );
  else {
    lines.push(
      ...questions
        .slice(0, 2)
        .map((item) => `- ${sanitizeHandoverValue(item)}`),
    );
    if (questions.length > 2)
      lines.push(
        `- ${questions.length - 2} more; see .transferkit.local/ONBOARDING.md and ONBOARDING.md#unknowns.`,
      );
  }
  return lines.join("\n");
}
