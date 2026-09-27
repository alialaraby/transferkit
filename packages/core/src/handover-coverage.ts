import type { HandoverPlan, HandoverPlanRequirement } from "./handover-plan.js";
import type { RequirementPriority } from "./index.js";

export interface HandoverCoverageCount {
  total: number;
  covered: number;
  missing: number;
  skipped: number;
  notApplicable: number;
  observed: number;
  human: number;
}

export interface HandoverCoverageReport {
  areas: {
    id: string;
    title: string;
    counts: HandoverCoverageCount;
    requirements: HandoverPlanRequirement[];
  }[];
  totals: HandoverCoverageCount;
  gaps: Record<RequirementPriority, number>;
}

export function summarizeHandoverCoverage(
  plan: HandoverPlan,
): HandoverCoverageReport {
  const areas = plan.areas.map((area) => ({
    id: area.id,
    title: area.title,
    counts: count(area.requirements),
    requirements: area.requirements,
  }));
  const all = areas.flatMap(({ requirements }) => requirements);
  return {
    areas,
    totals: count(all),
    gaps: {
      critical: gapCount(all, "critical"),
      recommended: gapCount(all, "recommended"),
      optional: gapCount(all, "optional"),
    },
  };
}

function count(
  requirements: readonly HandoverPlanRequirement[],
): HandoverCoverageCount {
  const active = requirements.filter(({ coverage }) => coverage !== "inactive");
  return {
    total: active.filter(({ coverage }) => coverage !== "not-applicable")
      .length,
    covered: active.filter(({ coverage }) => coverage === "covered").length,
    missing: active.filter(({ coverage }) => coverage === "missing").length,
    skipped: active.filter(({ coverage }) => coverage === "skipped").length,
    notApplicable: active.filter(
      ({ coverage }) => coverage === "not-applicable",
    ).length,
    observed: active.filter(
      ({ coverage, knowledge }) =>
        coverage === "covered" &&
        knowledge.some(({ classification }) => classification === "OBSERVED"),
    ).length,
    human: active.filter(
      ({ coverage, knowledge }) =>
        coverage === "covered" &&
        knowledge.some(({ classification }) => classification === "HUMAN"),
    ).length,
  };
}

function gapCount(
  requirements: readonly HandoverPlanRequirement[],
  priority: RequirementPriority,
): number {
  return requirements.filter(
    ({ coverage, priority: value }) =>
      value === priority && (coverage === "missing" || coverage === "skipped"),
  ).length;
}
