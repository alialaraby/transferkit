import type {
  OnboardingConceptEvidence,
  OnboardingScheduledCall,
  OnboardingScheduledConcept,
  OnboardingSelectedConcept,
  OnboardingTrace,
} from "@transferkit/core";

import { selectOnboardingConcepts } from "./onboarding-concepts.js";

export function selectScheduledConcepts(
  calls: readonly OnboardingScheduledCall[],
  evidence: OnboardingConceptEvidence,
  featured: readonly OnboardingSelectedConcept[],
): OnboardingScheduledConcept[] {
  const featuredNames = new Set(featured.map((item) => item.entity.name));
  if (!featuredNames.size) return [];
  const byJob = new Map<string, OnboardingScheduledCall[]>();
  for (const call of calls)
    byJob.set(call.job, [...(byJob.get(call.job) ?? []), call]);
  const results: OnboardingScheduledConcept[] = [];
  for (const [job, directCalls] of byJob) {
    const first = directCalls[0]!;
    const trace: OnboardingTrace = {
      id: `scheduled:${job}`,
      entry: { symbol: job, declaration: first.registration },
      methods: [
        {
          symbol: job,
          declaration: first.registration,
          events: directCalls.map((call) => ({
            kind: "call",
            detail: call.detail,
            at: call.at,
            path: [],
            ...(call.effect ? { effect: call.effect } : {}),
          })),
        },
      ],
      calls: [],
      gaps: [],
    };
    for (const concept of selectOnboardingConcepts(trace, evidence)) {
      if (!featuredNames.has(concept.entity.name)) continue;
      for (const call of concept.calls)
        results.push({
          job,
          ...(first.schedule ? { schedule: first.schedule } : {}),
          registration: first.registration,
          entity: concept.entity.name,
          effect: call.effect,
          at: call.at,
        });
    }
  }
  return results.slice(0, 5);
}
