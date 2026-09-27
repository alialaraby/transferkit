import { describe, expect, it } from "vitest";
import {
  createHandoverPlan,
  summarizeHandoverCoverage,
} from "@transferkit/core";
import { renderHandoverCoverageAudit } from "./handover-coverage-audit.js";

describe("handover audit v2", () => {
  it("distinguishes missing repository context, missing human knowledge, and coverage", () => {
    const plan = createHandoverPlan(
      {
        areas: [
          {
            id: "jobs",
            title: "Scheduled Jobs",
            requirements: [
              {
                id: "cadence",
                title: "Cadence",
                priority: "recommended",
                expectedSource: "repository",
              },
              { id: "owner", title: "Owner", priority: "critical" },
              {
                id: "history",
                title: "Production failure history",
                priority: "critical",
              },
            ],
          },
        ],
      },
      {
        confirmed: ["owner"],
        knowledge: [{ entityId: "owner", field: "content", value: "Platform" }],
        knowledgeLinks: [
          { requirementId: "owner", entityId: "owner", field: "content" },
        ],
      },
    );
    const output = renderHandoverCoverageAudit(summarizeHandoverCoverage(plan));
    expect(output).toContain("Critical gaps: 1");
    expect(output).toContain("Recommended gaps: 1");
    expect(output).toContain("✓ covered (human) Owner");
    expect(output).toContain(
      "✗ missing human knowledge Production failure history",
    );
    expect(output).toContain("✗ missing repository evidence/context Cadence");
  });
});
