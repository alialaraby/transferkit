import { describe, expect, it } from "vitest";

import {
  buildOwnershipReadinessEvidence,
  createOnboardingProgress,
  updateOnboardingTaskProgress,
  type OnboardingPlan,
} from "./index.js";

const plan: OnboardingPlan = {
  knowledgeMode: "repository-only",
  stages: [
    {
      id: "trace-it",
      title: "Trace It",
      tasks: [
        {
          id: "trace-it:routing-flow:consumer",
          stage: "trace-it",
          title: "Trace the `shipment.updated` routing flow",
          relatedEntityId: "consumer",
        },
      ],
    },
  ],
  missingInformation: [],
};

describe("ownership-readiness evidence", () => {
  it("reports repository-only knowledge as unknown without making a qualification claim", () => {
    const evidence = buildOwnershipReadinessEvidence(
      plan,
      createOnboardingProgress(plan),
    );

    expect(evidence.items[0]).toMatchObject({
      status: "unknown",
      statement: expect.stringContaining("repository-derived only"),
    });
    expect(evidence.items[1]).toMatchObject({
      status: "pending",
      relatedTaskId: "trace-it:routing-flow:consumer",
    });
  });

  it("turns only completed tasks into confirmed evidence", () => {
    const progress = updateOnboardingTaskProgress(
      createOnboardingProgress(plan),
      "trace-it:routing-flow:consumer",
      "completed",
      new Date("2026-09-22T12:00:00.000Z"),
    );

    expect(
      buildOwnershipReadinessEvidence(plan, progress).items.find(
        ({ relatedTaskId }) =>
          relatedTaskId === "trace-it:routing-flow:consumer",
      ),
    ).toMatchObject({
      status: "confirmed",
      statement: "Completed: Trace the `shipment.updated` routing flow",
    });
  });

  it("represents critical handover gaps as unresolved evidence", () => {
    const withGap: OnboardingPlan = {
      ...plan,
      knowledgeMode: "handover-aware",
      missingInformation: [
        {
          id: "missing:recovery:consumer",
          relatedEntityId: "consumer",
          message:
            "Recovery procedure for shipment-webhooks was not documented during handover.",
        },
      ],
    };

    expect(
      buildOwnershipReadinessEvidence(
        withGap,
        createOnboardingProgress(withGap),
      ).items,
    ).toContainEqual(
      expect.objectContaining({
        status: "unresolved",
        statement: expect.stringContaining("Recovery procedure"),
      }),
    );
  });
});
