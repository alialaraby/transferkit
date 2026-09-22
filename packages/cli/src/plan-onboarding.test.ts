import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HandoverEntity, HandoverState } from "@transferkit/core";
import { renderOnboardingPlan } from "@transferkit/renderers";
import { planOnboarding as createOnboardingPlan } from "@transferkit/standards";
import { planOnboarding } from "./plan-onboarding.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures",
);
const consumer: HandoverEntity = {
  id: "messaging.consumer:shipments",
  kind: "messaging.consumer",
  name: "shipment-webhooks",
  technology: "rabbitmq",
  queue: "shipment-webhooks",
  exchange: "shipment",
  routingKey: "shipment.updated",
  handler: "handleShipmentUpdate",
};

describe("onboarding planning", () => {
  it("creates a repository-only plan by scanning without handover state", async () => {
    const plan = await planOnboarding(join(fixtures, "milestone-four"));
    const output = renderOnboardingPlan(plan);
    expect(output).toContain("Review PostgreSQL/TypeORM data layer");
    expect(output).toContain("Review scheduled job `Jobs.hourly`");
    expect(output).toContain("Inspect Docker/runtime setup");
    expect(output).toContain("Review detected GitHub Actions `CI` workflow");
    expect(plan.missingInformation).toEqual([]);
  });

  it("enriches tasks with documented handover knowledge", () => {
    const plan = createOnboardingPlan(
      state([
        {
          entityId: consumer.id,
          field: "criticality",
          value: "critical to shipment notifications",
        },
        {
          entityId: consumer.id,
          field: "recoveryProcedure",
          value: "Replay the DLQ after checking idempotency",
        },
        {
          entityId: consumer.id,
          field: "operationalOwner",
          value: "Fulfilment Platform",
        },
      ]),
      { handoverAvailable: true },
    );
    const output = renderOnboardingPlan(plan);
    expect(output).toContain("critical to shipment notifications");
    expect(output).toContain("Replay the DLQ after checking idempotency");
    expect(output).toContain("Fulfilment Platform");
  });

  it("generates useful stages in the canonical order", () => {
    const plan = createOnboardingPlan(
      state([
        { entityId: consumer.id, field: "criticality", value: "critical" },
      ]),
      { handoverAvailable: true },
    );
    expect(plan.stages.map(({ title }) => title)).toEqual([
      "Understand Why",
      "Understand the System",
      "Trace It",
    ]);
  });

  it("omits stages with no relevant tasks", () => {
    const plan = createOnboardingPlan(state([]));
    expect(plan.stages.map(({ title }) => title)).toEqual([
      "Understand the System",
      "Trace It",
    ]);
    expect(plan.stages.every(({ tasks }) => tasks.length > 0)).toBe(true);
  });

  it("generates concrete tasks from messaging entity details", () => {
    const output = renderOnboardingPlan(createOnboardingPlan(state([])));
    expect(output).toContain(
      "Locate the RabbitMQ consumer `shipment-webhooks`",
    );
    expect(output).toContain("handler `handleShipmentUpdate`");
    expect(output).toContain("Trace the `shipment.updated` routing flow");
    expect(output).toContain(
      "exchange `shipment` to queue `shipment-webhooks`",
    );
  });

  it("surfaces critical missing handover knowledge but not optional gaps", () => {
    const plan = createOnboardingPlan(state([]), { handoverAvailable: true });
    const messages = plan.missingInformation.map(({ message }) => message);
    expect(messages).toContain(
      "Recovery / replay procedure for shipment-webhooks was not documented during handover.",
    );
    expect(messages).toHaveLength(4);
    expect(messages.join(" ")).not.toContain("optional");
  });

  it("does not invent handover information", () => {
    const output = renderOnboardingPlan(
      createOnboardingPlan(state([]), { handoverAvailable: false }),
    );
    expect(output).not.toContain("owner");
    expect(output).not.toContain("replay");
    expect(output).not.toContain("critical");
  });

  it("covers multiple discovered repository domains", async () => {
    const plan = await planOnboarding(join(fixtures, "milestone-four"));
    expect(plan.stages.map(({ title }) => title)).toEqual([
      "Understand the System",
      "Run It",
      "Trace It",
      "Change It",
    ]);
    expect(plan.stages.flatMap(({ tasks }) => tasks).length).toBeGreaterThan(6);
  });
});

function state(knowledge: HandoverState["knowledge"]): HandoverState {
  return { schemaVersion: 1, entities: [consumer], knowledge };
}
