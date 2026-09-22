import type { OnboardingPlan } from "@transferkit/core";
import { scanRepository } from "@transferkit/scanners";
import { planOnboarding as createOnboardingPlan } from "@transferkit/standards";

import { readHandoverState } from "./handover-state.js";
import { entitiesFromFindings } from "./scan-handover.js";

export async function planOnboarding(
  workingDirectory: string,
): Promise<OnboardingPlan> {
  const [storedState, findings] = await Promise.all([
    readHandoverState(workingDirectory),
    scanRepository(workingDirectory),
  ]);
  return createOnboardingPlan(
    { ...storedState, entities: entitiesFromFindings(findings) },
    { handoverAvailable: storedState.knowledge.length > 0 },
  );
}
