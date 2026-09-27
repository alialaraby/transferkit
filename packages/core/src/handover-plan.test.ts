import { describe, expect, it } from "vitest";
import {
  createHandoverPlan,
  observationsFromFindings,
  type HandoverStandard,
} from "./index.js";

const standard: HandoverStandard = {
  areas: [
    {
      id: "operations",
      title: "Operations",
      requirements: [
        {
          id: "operations.recovery",
          title: "Recovery",
          priority: "critical",
          expectedSource: "repository",
        },
        { id: "operations.owner", title: "Owner", priority: "recommended" },
        {
          id: "operations.history",
          title: "Incident history",
          priority: "optional",
        },
      ],
    },
  ],
};

describe("createHandoverPlan", () => {
  it("keeps a captured human answer incomplete until explicitly confirmed", () => {
    const input = {
      knowledge: [
        {
          entityId: "operations.owner",
          field: "content",
          value: "handled manually",
        },
      ],
      knowledgeLinks: [
        {
          requirementId: "operations.owner",
          entityId: "operations.owner",
          field: "content",
        },
      ],
    };
    expect(
      createHandoverPlan(standard, input).areas[0]?.requirements[1],
    ).toMatchObject({
      coverage: "missing",
      knowledge: [{ classification: "HUMAN", value: "handled manually" }],
    });
    expect(
      createHandoverPlan(standard, {
        ...input,
        confirmed: ["operations.owner"],
      }).areas[0]?.requirements[1]?.coverage,
    ).toBe("covered");
  });
  it("uses existing findings as evidence and existing knowledge as human knowledge", () => {
    const evidence = [{ file: "src/jobs.ts", line: 12 }];
    const plan = createHandoverPlan(standard, {
      confirmed: ["operations.owner"],
      observations: observationsFromFindings(
        [{ id: "job", kind: "scheduled-job", data: {}, evidence }],
        "operations.recovery",
      ),
      knowledge: [
        { entityId: "job", field: "operationalOwner", value: "Platform" },
      ],
      knowledgeLinks: [
        {
          requirementId: "operations.owner",
          entityId: "job",
          field: "operationalOwner",
        },
      ],
    });
    expect(plan.areas[0]?.requirements).toMatchObject([
      {
        coverage: "covered",
        knowledge: [{ classification: "OBSERVED" }],
        evidence,
      },
      {
        coverage: "covered",
        knowledge: [{ classification: "HUMAN", value: "Platform" }],
      },
      { coverage: "missing", knowledge: [{ classification: "UNKNOWN" }] },
    ]);
  });

  it("keeps inferred evidence uncovered and distinguishes skipped and not applicable", () => {
    const plan = createHandoverPlan(standard, {
      observations: [
        {
          requirementId: "operations.recovery",
          classification: "INFERRED",
          evidence: [{ file: "src/jobs.ts" }],
        },
      ],
      skipped: ["operations.owner"],
      notApplicable: ["operations.history"],
    });
    expect(plan.areas[0]?.requirements.map(({ coverage }) => coverage)).toEqual(
      ["missing", "skipped", "not-applicable"],
    );
    expect(
      plan.areas[0]?.requirements[0]?.knowledge.map(
        ({ classification }) => classification,
      ),
    ).toEqual(["INFERRED", "UNKNOWN"]);
  });

  it("does not count blank or skipped legacy answers as coverage", () => {
    const plan = createHandoverPlan(standard, {
      knowledge: [
        { entityId: "job", field: "operationalOwner", value: "  " },
        {
          entityId: "job",
          field: "incidentHistory",
          value: "known",
          status: "skipped",
        },
      ],
      knowledgeLinks: [
        {
          requirementId: "operations.owner",
          entityId: "job",
          field: "operationalOwner",
        },
        {
          requirementId: "operations.history",
          entityId: "job",
          field: "incidentHistory",
        },
      ],
    });
    expect(plan.areas[0]?.requirements.map(({ coverage }) => coverage)).toEqual(
      ["missing", "missing", "missing"],
    );
  });
});
