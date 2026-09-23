import { describe, expect, it } from "vitest";

import {
  auditHandoverKnowledge,
  buildMessagingSystems,
  buildOwnershipReadinessEvidence,
  createOnboardingProgress,
  detectKnowledgeGaps,
  updateOnboardingTaskProgress,
  type HandoverState,
  type KnowledgeRequirement,
  type OnboardingPlan,
} from "./index.js";

const requirements: KnowledgeRequirement[] = [
  {
    id: "messaging.owner",
    entityKind: "messaging.consumer",
    field: "owner",
    title: "Operational owner",
    priority: "critical",
  },
  {
    id: "messaging.notes",
    entityKind: "messaging.consumer",
    field: "notes",
    title: "Additional notes",
    priority: "optional",
  },
];

describe("core ownership-transfer workflow", () => {
  it("builds models, detects gaps, audits knowledge, and derives readiness", () => {
    const systems = buildMessagingSystems([
      {
        id: "consumer:shipments",
        kind: "messaging.consumer",
        name: "shipment-workers",
        technology: "rabbitmq",
        queue: "shipment-workers",
        handler: "handleShipment",
        evidence: [{ file: "src/shipment.consumer.ts", line: 4 }],
      },
    ]);
    expect(systems).toHaveLength(1);
    expect(systems[0]?.consumers[0]?.evidence[0]).toEqual({
      file: "src/shipment.consumer.ts",
      line: 4,
    });

    const state: HandoverState = {
      schemaVersion: 1,
      entities: [
        {
          id: "consumer:shipments",
          kind: "messaging.consumer",
          name: "shipment-workers",
        },
      ],
      knowledge: [
        {
          entityId: "consumer:shipments",
          field: "owner",
          value: "Platform team",
        },
      ],
    };
    expect(
      detectKnowledgeGaps(state.entities, state.knowledge, requirements),
    ).toEqual([
      expect.objectContaining({ field: "notes", priority: "optional" }),
    ]);
    expect(
      auditHandoverKnowledge(state, requirements).entities[0],
    ).toMatchObject({ criticalComplete: 1, criticalTotal: 1 });

    const plan: OnboardingPlan = {
      knowledgeMode: "handover-aware",
      stages: [
        {
          id: "understand-system",
          title: "Understand the System",
          tasks: [
            {
              id: "review-consumer",
              stage: "understand-system",
              title: "Review shipment consumer",
            },
          ],
        },
      ],
      missingInformation: [],
    };
    const progress = updateOnboardingTaskProgress(
      createOnboardingProgress(plan),
      "review-consumer",
      "completed",
      new Date("2026-09-22T12:00:00.000Z"),
    );
    expect(
      buildOwnershipReadinessEvidence(plan, progress).items,
    ).toContainEqual(expect.objectContaining({ status: "confirmed" }));
  });
});
