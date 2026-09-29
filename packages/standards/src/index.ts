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
export {
  planAdaptiveHandover,
  suggestBusinessFlows,
  type AdaptiveHandoverInput,
  type CustomHandoverTopic,
} from "./adaptive-handover-plan.js";
export { handoverStandardV2 } from "./handover-standard-v2.js";
export { planHandoverInterviewQuestions } from "./handover-question-planner.js";

export const packageName = "@transferkit/standards";
export const dependencies = [corePackageName] as const;

export { discoverSemanticIntegrations } from "./semantic-integrations.js";
export type { SemanticIntegration } from "./semantic-integrations.js";
export { suggestTransferPlan, transferSectionTitles } from "./transfer-plan.js";
export { understandProject } from "./project-understanding.js";
export { explainCandidateFlows } from "./explained-flow.js";
export { personalOnboardingExercises } from "./personal-onboarding.js";
