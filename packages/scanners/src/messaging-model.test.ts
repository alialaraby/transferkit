import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildRabbitMqMessagingModel } from "./messaging-model.js";
import { discoverRabbitMqConsumers } from "./rabbitmq-consumers.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rabbitmq-consumers",
);

describe("buildRabbitMqMessagingModel", () => {
  it("normalizes one RabbitMQ consumer and preserves its evidence", () => {
    const findings = discoverRabbitMqConsumers(join(fixtures, "single"));
    const systems = buildRabbitMqMessagingModel(findings);

    expect(systems).toEqual([
      {
        technology: "rabbitmq",
        consumers: [
          {
            id: "messaging.consumer:src/shipment.consumer.ts:ShipmentConsumer.handleShipmentUpdate",
            kind: "messaging.consumer",
            name: "shipment-webhooks",
            technology: "rabbitmq",
            queue: "shipment-webhooks",
            exchange: "shipment",
            routingKey: "shipment.updated",
            handler: "handleShipmentUpdate",
            evidence: findings[0]?.evidence,
          },
        ],
      },
    ]);
    expect(systems[0]?.consumers[0]?.evidence).toEqual(findings[0]?.evidence);
  });

  it("groups multiple consumers into the same RabbitMQ system", () => {
    const findings = discoverRabbitMqConsumers(join(fixtures, "multiple"));
    const systems = buildRabbitMqMessagingModel(findings);

    expect(systems).toHaveLength(1);
    expect(systems[0]?.consumers.map(({ name }) => name)).toEqual([
      "billing",
      "refunds",
    ]);
  });

  it("does not expose scanner framework details in the canonical model", () => {
    const findings = discoverRabbitMqConsumers(join(fixtures, "single"));
    const [consumer] =
      buildRabbitMqMessagingModel(findings)[0]?.consumers ?? [];

    expect(consumer).not.toHaveProperty("decorator");
    expect(consumer).not.toHaveProperty("framework");
    expect(consumer).not.toHaveProperty("sourceNode");
  });
});
