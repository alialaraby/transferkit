import {
  personalOnboardingExerciseIds,
  type PersonalOnboardingExercise,
} from "@transferkit/core";

export function personalOnboardingExercises(
  sections: ReadonlySet<string>,
  hasExplainedFlow: boolean,
  hasCandidateFlow: boolean,
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
      ? "candidate-flows"
      : "unknowns";
  return [
    {
      id: personalOnboardingExerciseIds[0],
      title: "Understand the system",
      objective:
        "Explain the entry point, major components, and supported relationships using the guide's evidence labels.",
      guideSectionId: "system-overview",
      outcome:
        "Write a short system map and list any relationships that still need confirmation.",
    },
    {
      id: personalOnboardingExerciseIds[1],
      title: "Trace a flow",
      objective: hasExplainedFlow
        ? "Check one explained static flow against its cited source and identify its branch and effect gaps."
        : hasCandidateFlow
          ? "Investigate one candidate route and record the source-backed steps you can establish."
          : "Identify what route or call evidence is missing before a flow can be traced.",
      guideSectionId: flowSection,
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
      objective:
        "Review unknowns and separate questions for a knowledgeable person from questions needing runtime evidence.",
      guideSectionId: "unknowns",
      outcome:
        "List the remaining questions, their intended source, and any evidence gathered.",
    },
  ];
}
