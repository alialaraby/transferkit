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
      /^### (?:Source journey|Entry to inspect): (.+)$/gmu,
    ),
  ]
    .map((match) => match[1]!)
    .slice(0, 2);
  const concepts = [
    ...(guideSections?.get("concepts") ?? "").matchAll(/^### ([^\n]+)$/gmu),
  ]
    .map((match) => match[1]!)
    .slice(0, 3);
  const orientation = sections.has("start-here")
    ? "Read Start here and System map"
    : "Read System map";
  const changeMap = sections.has("change-points")
    ? "Use Change points"
    : "Inspect the guide and cited source";
  return [
    {
      id: personalOnboardingExerciseIds[0],
      title: "Understand the system",
      objective: concepts.length
        ? `${orientation} and Concepts. Explain what the repository does and how ${concepts.join(", ")} appear in the selected entries; label unsupported business meanings and relationships.`
        : `${orientation}. Explain the repository's stated purpose or source-level role, its entry point and input/output, and what remains unknown.`,
      guideSectionId: "system-overview",
      outcome:
        "Write a short mental model with citations and one question for an owner or source check.",
    },
    {
      id: personalOnboardingExerciseIds[1],
      title: "Trace a flow",
      objective:
        journeys.length >= 2
          ? `Explain ${journeys[0]} and ${journeys[1]} as separate entries: trigger, decision, output or state, alternate exit, and first unsupported edge. Only connect them where the guide has evidence.`
          : journeys.length === 1
            ? `Explain ${journeys[0]}: input, output or state, alternate exit, and first unsupported edge. Mark repository statements separately from traced behavior.`
            : hasExplainedFlow
              ? "Check one connected journey against its cited source and identify its decision, effect, and unsupported steps."
              : hasCandidateFlow
                ? "Investigate one candidate route and record the source-backed steps you can establish."
                : "Identify what route or call evidence is missing before a flow can be traced.",
      guideSectionId: flowSection,
      ...(journeys.length ? { linkedJourneys: journeys } : {}),
      outcome:
        hasExplainedFlow || hasCandidateFlow
          ? "Record a short story with repository-relative citations, separate entry points, and unresolved steps."
          : "Record the missing evidence and a concrete next investigation step.",
    },
    {
      id: personalOnboardingExerciseIds[2],
      title: "Attempt a local run",
      objective:
        "Read Run and observe. Verify the declared runtime and prerequisites, choose the guide's safe first observation or record its blocker, and distinguish a documented command from one you actually ran.",
      guideSectionId: "setup-and-operations",
      outcome:
        "Record commands actually attempted, observed results, and any blocker; documented commands are runtime unverified until tried.",
    },
    {
      id: personalOnboardingExerciseIds[3],
      title: "Identify remaining ownership gaps",
      objective: journeys.length
        ? `${changeMap} to find where to investigate ${journeys[0]} and its test candidate; ask which remaining questions need source, runtime, or owner evidence.`
        : `${changeMap} to find a likely edit and test location if possible; classify remaining questions as source, runtime, or owner-dependent.`,
      guideSectionId: sections.has("change-points")
        ? "change-points"
        : "unknowns",
      outcome:
        "Record a likely change location, test evidence or gap, and questions to take to an owner.",
    },
  ];
}
