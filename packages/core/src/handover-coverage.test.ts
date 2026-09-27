import { describe, expect, it } from "vitest";
import {
  createHandoverPlan,
  summarizeHandoverCoverage,
  type HandoverStandard,
} from "./index.js";

const standard: HandoverStandard = {
  areas: [
    {
      id: "operations",
      title: "Operations",
      requirements: [
        { id: "owner", title: "Owner", priority: "critical" },
        {
          id: "cadence",
          title: "Cadence",
          priority: "recommended",
          expectedSource: "repository",
        },
        { id: "history", title: "History", priority: "optional" },
        { id: "recovery", title: "Recovery", priority: "critical" },
      ],
    },
  ],
};

describe("handover coverage", () => {
  it("counts covered, missing, skipped, and not applicable separately", () => {
    const plan = createHandoverPlan(standard, {
      confirmed: ["owner"],
      knowledge: [{ entityId: "owner", field: "content", value: "Platform" }],
      knowledgeLinks: [
        { requirementId: "owner", entityId: "owner", field: "content" },
      ],
      observations: [
        {
          requirementId: "cadence",
          classification: "OBSERVED",
          value: "daily",
          evidence: [{ file: "jobs.ts" }],
        },
      ],
      skipped: ["history"],
      notApplicable: ["recovery"],
    });
    expect(summarizeHandoverCoverage(plan)).toMatchObject({
      totals: {
        total: 3,
        covered: 2,
        missing: 0,
        skipped: 1,
        notApplicable: 1,
        observed: 1,
        human: 1,
      },
      gaps: { critical: 0, recommended: 0, optional: 1 },
    });
  });

  it("keeps inferred evidence missing", () => {
    const plan = createHandoverPlan(standard, {
      observations: [
        {
          requirementId: "cadence",
          classification: "INFERRED",
          evidence: [{ file: "jobs.ts" }],
        },
      ],
    });
    expect(summarizeHandoverCoverage(plan).gaps).toEqual({
      critical: 2,
      recommended: 1,
      optional: 1,
    });
  });
});
