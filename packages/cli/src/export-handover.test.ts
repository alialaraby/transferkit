import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { HandoverState } from "@transferkit/core";

import { exportHandover, messagingExportFileName } from "./export-handover.js";
import { readHandoverState, writeHandoverState } from "./handover-state.js";

const entityId = "messaging.consumer:shipments";

describe("exportHandover", () => {
  it("generates messaging.md from structured messaging state", async () => {
    const directory = await projectWithState(state());

    await exportHandover(directory);

    expect(await exportedMarkdown(directory)).toBe(`# Messaging

## shipment-webhooks

- **Technology:** rabbitmq
- **Queue:** shipment-webhooks
- **Exchange:** shipment
- **Routing key:** shipment.updated
- **Handler:** handleShipmentUpdate
- **Criticality:** critical
- **Failure behavior:** Dead-letters after retries
- **Recovery / replay procedure:** Replay the DLQ
- **Operational owner:** Platform
`);
  });

  it("renders missing and skipped knowledge clearly", async () => {
    const value = state();
    value.knowledge = [
      { entityId, field: "criticality", value: "critical" },
      { entityId, field: "failureBehavior", value: "", status: "skipped" },
    ];
    const directory = await projectWithState(value);

    await exportHandover(directory);
    const markdown = await exportedMarkdown(directory);

    expect(markdown).toContain("**Failure behavior:** _Missing (skipped)_");
    expect(markdown).toContain("**Recovery / replay procedure:** _Missing_");
    expect(markdown).toContain("**Operational owner:** _Missing_");
  });

  it("safely replaces generated output and is idempotent", async () => {
    const directory = await projectWithState(state());
    await exportHandover(directory);
    const first = await exportedMarkdown(directory);

    await exportHandover(directory);

    expect(await exportedMarkdown(directory)).toBe(first);
  });

  it("does not mutate structured state", async () => {
    const directory = await projectWithState(state());
    const before = await readHandoverState(directory);

    await exportHandover(directory);

    expect(await readHandoverState(directory)).toEqual(before);
  });
});

function state(): HandoverState {
  return {
    schemaVersion: 1,
    entities: [
      {
        id: entityId,
        kind: "messaging.consumer",
        name: "shipment-webhooks",
        technology: "rabbitmq",
        queue: "shipment-webhooks",
        exchange: "shipment",
        routingKey: "shipment.updated",
        handler: "handleShipmentUpdate",
      },
    ],
    knowledge: [
      { entityId, field: "criticality", value: "critical" },
      {
        entityId,
        field: "failureBehavior",
        value: "Dead-letters after retries",
      },
      { entityId, field: "recoveryProcedure", value: "Replay the DLQ" },
      { entityId, field: "operationalOwner", value: "Platform" },
    ],
  };
}

async function projectWithState(value: HandoverState): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-export-"));
  await writeHandoverState(directory, value);
  return directory;
}

async function exportedMarkdown(directory: string): Promise<string> {
  return readFile(join(directory, messagingExportFileName), "utf8");
}
