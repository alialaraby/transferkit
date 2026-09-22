import { describe, expect, it } from "vitest";

import { messagingConsumerRequirements } from "./index.js";

describe("messaging consumer requirements", () => {
  it("defines the four stable critical requirements", () => {
    expect(messagingConsumerRequirements).toEqual([
      {
        id: "messaging.consumer.criticality",
        entityKind: "messaging.consumer",
        field: "criticality",
        title: "Criticality",
        priority: "critical",
      },
      {
        id: "messaging.consumer.failure-behavior",
        entityKind: "messaging.consumer",
        field: "failureBehavior",
        title: "Failure behavior",
        priority: "critical",
      },
      {
        id: "messaging.consumer.recovery",
        entityKind: "messaging.consumer",
        field: "recoveryProcedure",
        title: "Recovery / replay procedure",
        priority: "critical",
      },
      {
        id: "messaging.consumer.owner",
        entityKind: "messaging.consumer",
        field: "operationalOwner",
        title: "Operational owner",
        priority: "critical",
      },
    ]);
    expect(
      messagingConsumerRequirements.every(
        ({ entityKind }) => entityKind === "messaging.consumer",
      ),
    ).toBe(true);
  });
});
