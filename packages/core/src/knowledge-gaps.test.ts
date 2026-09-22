import { describe, expect, it } from "vitest";

import {
  detectKnowledgeGaps,
  type KnowledgeEntry,
  type KnowledgeRequirement,
} from "./index.js";

const entity = { id: "consumer:shipments", kind: "messaging.consumer" };
const requirements = [
  {
    id: "criticality",
    entityKind: "messaging.consumer",
    field: "criticality",
    title: "Criticality",
    priority: "critical",
  },
  {
    id: "failure",
    entityKind: "messaging.consumer",
    field: "failureBehavior",
    title: "Failure behavior",
    priority: "recommended",
  },
  {
    id: "recovery",
    entityKind: "messaging.consumer",
    field: "recoveryProcedure",
    title: "Recovery procedure",
    priority: "critical",
  },
  {
    id: "owner",
    entityKind: "messaging.consumer",
    field: "operationalOwner",
    title: "Operational owner",
    priority: "optional",
  },
] as const satisfies readonly KnowledgeRequirement[];

describe("detectKnowledgeGaps", () => {
  it("reports all four missing messaging requirements", () => {
    expect(detectKnowledgeGaps([entity], [], requirements)).toEqual([
      {
        requirementId: "criticality",
        entityId: entity.id,
        field: "criticality",
        priority: "critical",
      },
      {
        requirementId: "failure",
        entityId: entity.id,
        field: "failureBehavior",
        priority: "recommended",
      },
      {
        requirementId: "recovery",
        entityId: entity.id,
        field: "recoveryProcedure",
        priority: "critical",
      },
      {
        requirementId: "owner",
        entityId: entity.id,
        field: "operationalOwner",
        priority: "optional",
      },
    ]);
  });

  it("reports only fields without knowledge entries", () => {
    const entries: KnowledgeEntry[] = [
      { entityId: entity.id, field: "criticality", value: "high" },
      { entityId: entity.id, field: "operationalOwner", value: "Platform" },
    ];

    expect(
      detectKnowledgeGaps([entity], entries, requirements).map(
        ({ requirementId }) => requirementId,
      ),
    ).toEqual(["failure", "recovery"]);
  });

  it("reports no gaps when every required field has an entry", () => {
    const entries: KnowledgeEntry[] = requirements.map(({ field }) => ({
      entityId: entity.id,
      field,
      value: "known",
    }));

    expect(detectKnowledgeGaps([entity], entries, requirements)).toEqual([]);
  });

  it("preserves each requirement priority on its gap", () => {
    expect(
      detectKnowledgeGaps([entity], [], requirements).map(
        ({ requirementId, priority }) => [requirementId, priority],
      ),
    ).toEqual([
      ["criticality", "critical"],
      ["failure", "recommended"],
      ["recovery", "critical"],
      ["owner", "optional"],
    ]);
  });

  it("does not treat blank or skipped knowledge as completed", () => {
    expect(
      detectKnowledgeGaps(
        [entity],
        [
          { entityId: entity.id, field: "criticality", value: "   " },
          {
            entityId: entity.id,
            field: "failureBehavior",
            value: "",
            status: "skipped",
          },
        ],
        requirements,
      ).map(({ field }) => field),
    ).toEqual([
      "criticality",
      "failureBehavior",
      "recoveryProcedure",
      "operationalOwner",
    ]);
  });
});
