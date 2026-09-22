export interface OnboardingTask {
  title: string;
  detail?: string;
  missingKnowledge?: boolean;
}

export interface ConsumerOnboardingPlan {
  entityId: string;
  entityName: string;
  tasks: OnboardingTask[];
}

export interface MessagingOnboardingPlan {
  category: "Messaging";
  consumers: ConsumerOnboardingPlan[];
}
