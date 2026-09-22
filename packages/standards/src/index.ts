import { packageName as corePackageName } from "@transferkit/core";
export { planMessagingInterviewQuestions } from "./messaging-question-planner.js";
export { planOnboarding } from "./onboarding-plan.js";
export {
  messagingConsumerRequirements,
  type MessagingConsumerKnowledgeField,
  type MessagingConsumerRequirement,
} from "./messaging-standard.js";
export {
  handoverRequirements,
  type HandoverKnowledgeField,
} from "./handover-standard.js";
export { planHandoverInterviewQuestions } from "./handover-question-planner.js";

export const packageName = "@transferkit/standards";
export const dependencies = [corePackageName] as const;
