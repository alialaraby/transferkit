export const onboardingStageOrder = [
  "understand-why",
  "understand-system",
  "run-it",
  "trace-it",
  "operate-it",
  "change-it",
  "own-it",
] as const;

export type OnboardingStageId = (typeof onboardingStageOrder)[number];

export interface OnboardingTask {
  id: string;
  stage: OnboardingStageId;
  title: string;
  description?: string;
  relatedEntityId?: string;
}

export interface OnboardingStage {
  id: OnboardingStageId;
  title: string;
  tasks: OnboardingTask[];
}

export interface MissingOnboardingInformation {
  id: string;
  relatedEntityId: string;
  message: string;
}

export interface OnboardingPlan {
  knowledgeMode: "repository-only" | "handover-aware";
  stages: OnboardingStage[];
  missingInformation: MissingOnboardingInformation[];
}
