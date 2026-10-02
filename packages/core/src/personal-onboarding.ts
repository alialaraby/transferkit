export interface PersonalOnboardingExercise {
  id: PersonalOnboardingExerciseId;
  title: string;
  objective: string;
  guideSectionId: string;
  outcome: string;
  linkedJourneys?: readonly string[];
}

export const personalOnboardingExerciseIds = [
  "v2:understand-system",
  "v2:trace-flow",
  "v2:attempt-local-run",
  "v2:identify-ownership-gaps",
] as const;

export type PersonalOnboardingExerciseId =
  (typeof personalOnboardingExerciseIds)[number];

export interface PersonalOnboardingExerciseProgress {
  id: PersonalOnboardingExerciseId;
  status: "not-started" | "in-progress" | "completed" | "skipped";
  completedAt?: string;
}

export interface PersonalOnboardingState {
  schemaVersion: 1;
  exercises: PersonalOnboardingExerciseProgress[];
  markdownSnapshot: Record<
    PersonalOnboardingExerciseId,
    { status: PersonalOnboardingExerciseProgress["status"]; checked: boolean }
  >;
}
