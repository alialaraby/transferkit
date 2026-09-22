import type { MessagingOnboardingPlan } from "@transferkit/core";
import { planMessagingOnboarding } from "@transferkit/standards";

import { readHandoverState } from "./handover-state.js";

export async function planOnboarding(
  workingDirectory: string,
): Promise<MessagingOnboardingPlan> {
  return planMessagingOnboarding(await readHandoverState(workingDirectory));
}
