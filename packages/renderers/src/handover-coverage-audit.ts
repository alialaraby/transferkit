import type {
  HandoverCoverageReport,
  HandoverPlanRequirement,
} from "@transferkit/core";

export function renderHandoverCoverageAudit(
  report: HandoverCoverageReport,
): string {
  const lines = [
    "Handover audit",
    "",
    `Critical gaps: ${report.gaps.critical}`,
    `Recommended gaps: ${report.gaps.recommended}`,
    `Optional gaps: ${report.gaps.optional}`,
    `Covered: ${report.totals.covered}/${report.totals.total} requirements`,
    `Observed: ${report.totals.observed} · Human knowledge: ${report.totals.human}`,
    `Skipped: ${report.totals.skipped} · Not applicable: ${report.totals.notApplicable}`,
  ];
  for (const area of report.areas) {
    const relevant = area.requirements.filter(
      ({ coverage }) => coverage !== "inactive",
    );
    if (!relevant.length) continue;
    lines.push("", `${area.title} ${area.counts.covered}/${area.counts.total}`);
    for (const requirement of [...relevant].sort(priorityOrder)) {
      const label = requirement.subject
        ? `${requirement.subject}: ${requirement.title}`
        : requirement.title;
      lines.push(
        `  ${renderStatus(requirement)} ${label} (${requirement.priority})`,
      );
    }
  }
  return lines.join("\n");
}

function renderStatus(requirement: HandoverPlanRequirement): string {
  if (requirement.coverage === "skipped") return "– skipped";
  if (requirement.coverage === "not-applicable") return "○ not applicable";
  if (requirement.coverage === "missing") {
    if (
      requirement.knowledge.some(
        ({ classification, value }) =>
          classification === "HUMAN" && Boolean(value?.trim()),
      )
    )
      return "✗ recorded, awaiting confirmation";
    return requirement.expectedSource === "repository"
      ? "✗ missing repository evidence/context"
      : "✗ missing human knowledge";
  }
  const observed = requirement.knowledge.some(
    ({ classification }) => classification === "OBSERVED",
  );
  const human = requirement.knowledge.some(
    ({ classification }) => classification === "HUMAN",
  );
  if (observed && human) return "✓ covered (observed + human)";
  if (observed) return "✓ covered (observed)";
  return "✓ covered (human)";
}

function priorityOrder(
  a: HandoverPlanRequirement,
  b: HandoverPlanRequirement,
): number {
  const order = { critical: 0, recommended: 1, optional: 2 };
  return order[a.priority] - order[b.priority];
}
