import { describe, expect, it } from "vitest";

import type { HandoverState } from "@transferkit/core";
import { renderMessagingOnboardingPlan } from "@transferkit/renderers";

import { planMessagingOnboarding } from "@transferkit/standards";

const entityId = "messaging.consumer:shipments";
const consumer = {
  id: entityId,
  kind: "messaging.consumer" as const,
  name: "shipment-webhooks",
  technology: "rabbitmq",
  queue: "shipment-webhooks",
  exchange: "shipment",
  routingKey: "shipment.updated",
  handler: "handleShipmentUpdate",
};

describe("planMessagingOnboarding", () => {
  it("creates a useful repository-only messaging plan", () => {
    const plan = planMessagingOnboarding(stateWithKnowledge([]));
    const output = renderMessagingOnboardingPlan(plan);

    expect(output).toContain("[ ] Locate the consumer implementation");
    expect(output).toContain("handler: handleShipmentUpdate");
    expect(output).toContain("queue: shipment-webhooks");
    expect(output).toContain("exchange: shipment");
    expect(output).toContain("routing key: shipment.updated");
    expect(
      plan.consumers[0]?.tasks.filter(
        ({ missingKnowledge }) => missingKnowledge,
      ),
    ).toHaveLength(4);
  });

  it("enriches every knowledge task when handover knowledge is complete", () => {
    const plan = planMessagingOnboarding(completeState());
    const output = renderMessagingOnboardingPlan(plan);

    expect(output).toContain("Review criticality — critical");
    expect(output).toContain(
      "Review failure behavior — Dead-letters after retries",
    );
    expect(output).toContain(
      "Review or practice recovery/replay — Replay the DLQ",
    );
    expect(output).toContain("Identify operational owner — Platform");
    expect(output).not.toContain("Missing handover knowledge");
  });

  it("explicitly identifies missing recovery information", () => {
    const value = completeState();
    value.knowledge = value.knowledge.filter(
      ({ field }) => field !== "recoveryProcedure",
    );

    const output = renderMessagingOnboardingPlan(
      planMessagingOnboarding(value),
    );

    expect(output).toContain(
      "Review or practice recovery/replay — Missing handover knowledge: Recovery / replay procedure",
    );
    expect(output).toContain(
      "Review failure behavior — Dead-letters after retries",
    );
  });

  it("creates separate tasks for multiple consumers", () => {
    const value = stateWithKnowledge([]);
    value.entities.push({
      ...consumer,
      id: "messaging.consumer:billing",
      name: "billing",
      queue: "billing",
      handler: "handleBilling",
    });

    const plan = planMessagingOnboarding(value);

    expect(plan.consumers.map(({ entityName }) => entityName)).toEqual([
      "shipment-webhooks",
      "billing",
    ]);
    expect(plan.consumers.every(({ tasks }) => tasks.length === 6)).toBe(true);
  });

  it("reports clearly when there are no messaging consumers", () => {
    const plan = planMessagingOnboarding(stateWithKnowledge([]));
    plan.consumers = [];

    expect(renderMessagingOnboardingPlan(plan)).toBe(
      "Messaging\n\nNo messaging consumers found.",
    );
  });

  it("does not invent knowledge values when none exist", () => {
    const output = renderMessagingOnboardingPlan(
      planMessagingOnboarding(stateWithKnowledge([])),
    );

    expect(output.match(/Missing handover knowledge/g)).toHaveLength(4);
    expect(output).not.toContain("unknown team");
    expect(output).not.toContain("automatic replay");
  });
});

function completeState(): HandoverState {
  return stateWithKnowledge([
    { entityId, field: "criticality", value: "critical" },
    {
      entityId,
      field: "failureBehavior",
      value: "Dead-letters after retries",
    },
    { entityId, field: "recoveryProcedure", value: "Replay the DLQ" },
    { entityId, field: "operationalOwner", value: "Platform" },
  ]);
}

function stateWithKnowledge(
  knowledge: HandoverState["knowledge"],
): HandoverState {
  return { schemaVersion: 1, entities: [consumer], knowledge };
}
