import {
  personalOnboardingExerciseIds,
  type PersonalOnboardingExercise,
} from "@transferkit/core";

export function personalOnboardingExercises(
  sections: ReadonlySet<string>,
  hasExplainedFlow: boolean,
  hasCandidateFlow: boolean,
  guideSections?: ReadonlyMap<string, string>,
): PersonalOnboardingExercise[] {
  for (const required of [
    "system-overview",
    "setup-and-operations",
    "unknowns",
  ])
    if (!sections.has(required))
      throw new Error(
        `Shared ONBOARDING.md lacks the ${required} section; generate or repair the guide first.`,
      );
  const flowSection = hasExplainedFlow
    ? "explained-flow"
    : hasCandidateFlow
      ? sections.has("candidate-flows")
        ? "candidate-flows"
        : "reference-appendix"
      : "unknowns";
  const journeys = [
    ...(guideSections?.get("explained-flow") ?? "").matchAll(
      /^### Source journey: (.+)$/gmu,
    ),
  ]
    .map((match) => match[1]!)
    .slice(0, 2);
  const concepts = [
    ...(guideSections?.get("concepts") ?? "").matchAll(/^### ([^\n]+)$/gmu),
  ]
    .map((match) => match[1]!)
    .slice(0, 3);
  return [
    {
      id: personalOnboardingExerciseIds[0],
      title: "Understand the system",
      objective: concepts.length
        ? `Map ${concepts.join(", ")} from cited declarations to the entry point and selected journeys; label uncertain relationships.`
        : "Explain the entry point, major components, and supported relationships using the guide's evidence labels.",
      guideSectionId: "system-overview",
      outcome:
        "Write a short system map and list any relationships that still need confirmation.",
    },
    {
      id: personalOnboardingExerciseIds[1],
      title: "Trace a flow",
      objective:
        journeys.length >= 2
          ? `Explain ${journeys[0]} and ${journeys[1]} from cited source, including an alternate exit and the first unsupported edge in each.`
          : journeys.length === 1
            ? `Explain ${journeys[0]} from cited source, including an alternate exit and its first unsupported edge; identify what second path is missing.`
            : hasExplainedFlow
              ? "Check one explained static flow against its cited source and identify its branch and effect gaps."
              : hasCandidateFlow
                ? "Investigate one candidate route and record the source-backed steps you can establish."
                : "Identify what route or call evidence is missing before a flow can be traced.",
      guideSectionId: flowSection,
      ...(journeys.length ? { linkedJourneys: journeys } : {}),
      outcome:
        hasExplainedFlow || hasCandidateFlow
          ? "Record a concise trace with repository-relative citations and unresolved steps."
          : "Record the missing evidence and a concrete next investigation step.",
    },
    {
      id: personalOnboardingExerciseIds[2],
      title: "Attempt a local run",
      objective:
        "Review documented setup clues, verify prerequisites and safe credentials, then attempt only steps you can safely perform.",
      guideSectionId: "setup-and-operations",
      outcome:
        "Record commands actually attempted, observed results, and any blocker; documented commands are runtime unverified until tried.",
    },
    {
      id: personalOnboardingExerciseIds[3],
      title: "Identify remaining ownership gaps",
      objective: journeys.length
        ? `Find a likely change and test location for ${journeys[0]}; classify remaining questions as source, runtime, or person-dependent.`
        : "Identify a likely change point if possible; classify remaining questions as source, runtime, or person-dependent.",
      guideSectionId: "unknowns",
      outcome:
        "List the remaining questions, their intended source, and any evidence gathered.",
    },
  ];
}
