import type {
  OnboardingStoryClaim,
  OnboardingStoryEvidence,
  OnboardingStoryInventory,
} from "@transferkit/core";

export function selectOnboardingStoryInventory(
  evidence: OnboardingStoryEvidence,
): OnboardingStoryInventory {
  const claims = evidence.claims.filter((claim) => claim.evidence.length > 0);
  const selected = (kind: OnboardingStoryClaim["kind"], limit: number) =>
    unique(claims.filter((claim) => claim.kind === kind)).slice(0, limit);
  const purpose = selected("purpose", 1)[0];
  const entries = selected("entry", 16);
  const outputs = selected("output", 6);
  const artifacts = selected("artifact", 12);
  const terms = evidence.terms
    .map((term) => ({
      term,
      score:
        (term.meaning ? 4 : 0) +
        term.relationCount +
        term.relations.length * 2 +
        Math.min(8, term.evidence.length - 1) +
        [purpose, ...entries, ...outputs]
          .filter((claim) => claim !== undefined)
          .reduce(
            (count, claim) =>
              count +
              (mentions(claim.text, term.name)
                ? claim.kind === "purpose"
                  ? 4
                  : 2
                : 0),
            0,
          ),
    }))
    .sort((a, b) => b.score - a.score || a.term.name.localeCompare(b.term.name))
    .slice(0, 8)
    .map(({ term }) => term);
  const unknowns: string[] = [];
  if (!purpose)
    unknowns.push(
      "The repository purpose is not established by project-specific prose.",
    );
  if (!entries.length)
    unknowns.push("No supported entry point was identified.");
  if (!outputs.length)
    unknowns.push(
      "The repository's outputs are not established by the inspected documentation.",
    );
  if (terms.some((term) => !term.meaning))
    unknowns.push(
      "Business meanings for some code terms require owner confirmation.",
    );
  return {
    ...(purpose ? { purpose } : {}),
    roles: selected("role", 4),
    entries,
    artifacts,
    outputs,
    boundaries: selected("boundary", 8),
    observations: selected("observation", 8),
    terms,
    rejectedDescriptions: evidence.rejectedDescriptions,
    unknowns,
  };
}

function unique(claims: OnboardingStoryClaim[]): OnboardingStoryClaim[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = `${claim.kind}:${claim.name ?? ""}:${claim.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mentions(text: string, name: string): boolean {
  const words = name.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase();
  const haystack = text.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase();
  return haystack.includes(words);
}
