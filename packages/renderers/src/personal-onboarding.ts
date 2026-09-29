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
}

export function renderPersonalOnboarding(
  exercises: readonly PersonalOnboardingExercise[],
): string {
  const lines = [
    "# Personal onboarding workspace",
    "",
    "This is your local workspace. The linked shared guide holds repository evidence; record your own observations here.",
    "Checkboxes are self-reported, not verified competence. Run `tk onboard sync` after editing them; `tk onboard status` reads the synchronized JSON state.",
    "",
  ];
  for (const [index, exercise] of exercises.entries()) {
    lines.push(
      `## ${index + 1}. ${exercise.title}`,
      `<!-- tk:onboard:exercise ${exercise.id} -->`,
      "",
      `- [ ] **Objective:** ${exercise.objective}`,
      `- **Guide:** [${exercise.title}](../ONBOARDING.md#${exercise.guideSectionId})`,
      `- **Outcome:** ${exercise.outcome}`,
      "",
      "**Notes**",
      "",
      "_Add your observations._",
      "",
      "**Questions**",
      "",
      "_Add questions for a person or a runtime check._",
      "",
      "**Evidence**",
      "",
      "_Add repository-relative references or results you observed._",
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderPersonalOnboardingPlan(
  view: PersonalOnboardingView,
): string {
  const lines = [
    "Onboarding v2 plan (repository-only)",
    "Exercise status is self-reported, not verified competence.",
    ...(view.syncNeeded
      ? [
          "Personal Markdown has unsynchronized checkbox changes; run 'tk onboard sync'.",
        ]
      : []),
    "",
  ];
  for (const [index, exercise] of view.exercises.entries()) {
    lines.push(
      `${index + 1}. ${exercise.title} [${view.statuses[exercise.id]}] (${exercise.id})`,
      `   Outcome: ${exercise.outcome}`,
      `   Guide: ONBOARDING.md#${exercise.guideSectionId}`,
    );
  }
  lines.push(
    "",
    "Record notes and evidence in .transferkit.local/ONBOARDING.md. Use 'tk onboard task <v2-id> <status>' or edit a checkbox and run 'tk onboard sync'.",
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
    "Onboarding v2 progress (self-reported)",
    `${completed}/${view.exercises.length} exercises completed; completion is not verified competence.`,
    ...(view.syncNeeded
      ? [
          "Personal Markdown has unsynchronized checkbox changes; run 'tk onboard sync'.",
        ]
      : []),
    "",
    ...view.exercises.map(
      ({ id, title }) => `- ${title} (${id}): ${view.statuses[id]}`,
    ),
    ...(next ? ["", `Next: ${next.title} (${next.id})`] : []),
    "",
    "Remaining questions and unknowns",
  ];
  const questions = [
    ...view.questions.map((item) => `Personal: ${item}`),
    ...view.unknowns.map((item) => `Shared guide: ${item}`),
  ];
  if (questions.length === 0)
    lines.push(
      "No questions recorded here; review .transferkit.local/ONBOARDING.md and ONBOARDING.md#unknowns.",
    );
  else {
    lines.push(
      ...questions
        .slice(0, 6)
        .map((item) => `- ${sanitizeHandoverValue(item)}`),
    );
    if (questions.length > 6)
      lines.push(
        `- ${questions.length - 6} more in the personal workspace or shared guide.`,
      );
  }
  return lines.join("\n");
}
