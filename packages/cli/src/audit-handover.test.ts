import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { HandoverState } from "@transferkit/core";
import { renderHandoverAudit } from "@transferkit/renderers";

import { auditHandover } from "./audit-handover.js";
import { writeHandoverState } from "./handover-state.js";

const consumer = {
  id: "messaging.consumer:shipments",
  kind: "messaging.consumer" as const,
  name: "shipment-webhooks",
};

describe("auditHandover", () => {
  it("reports a complete audit", async () => {
    const result = await auditHandover(await projectWithState(completeState()));

    expect(result.entities[0]).toMatchObject({
      entityName: "shipment-webhooks",
      criticalComplete: 4,
      criticalTotal: 4,
    });
    expect(
      result.entities[0]?.requirements.map(({ status }) => status),
    ).toEqual(["satisfied", "satisfied", "satisfied", "satisfied"]);
    expect(renderHandoverAudit(result)).toContain(
      "4 / 4 critical requirements complete",
    );
  });

  it("reports satisfied, missing, and skipped requirements separately", async () => {
    const state = completeState();
    state.knowledge = [
      state.knowledge[0]!,
      { ...state.knowledge[1]!, value: "", status: "skipped" },
    ];

    const result = await auditHandover(await projectWithState(state));

    expect(
      result.entities[0]?.requirements.map(({ status }) => status),
    ).toEqual(["satisfied", "skipped", "missing", "missing"]);
    expect(renderHandoverAudit(result)).toContain(
      "– Failure behavior (skipped)",
    );
    expect(renderHandoverAudit(result)).toContain(
      "✗ Recovery / replay procedure",
    );
    expect(result.entities[0]?.criticalComplete).toBe(1);
  });

  it("audits multiple consumers independently", async () => {
    const state = completeState();
    state.entities.push({
      ...consumer,
      id: "messaging.consumer:billing",
      name: "billing",
    });

    const result = await auditHandover(await projectWithState(state));

    expect(result.entities.map(({ entityName }) => entityName)).toEqual([
      "shipment-webhooks",
      "billing",
    ]);
    expect(result.entities[1]?.criticalComplete).toBe(0);
  });

  it("clearly reports no consumers and succeeds with an empty result", async () => {
    const result = await auditHandover(
      await projectWithState({ schemaVersion: 1, entities: [], knowledge: [] }),
    );

    expect(result.entities).toEqual([]);
    expect(renderHandoverAudit(result)).toBe(
      "Handover\n\nNo auditable handover entities found.",
    );
  });

  it("audits multiple domains and reports exact missing fields", async () => {
    const state: HandoverState = {
      schemaVersion: 1,
      entities: [
        { id: "job:billing", kind: "scheduled-job", name: "BillingJob.run" },
        { id: "integration:stripe", kind: "integration", name: "Stripe" },
      ],
      knowledge: [
        { entityId: "job:billing", field: "criticality", value: "critical" },
        {
          entityId: "integration:stripe",
          field: "failureBehavior",
          value: "Checkout is unavailable",
        },
      ],
    };

    const result = await auditHandover(await projectWithState(state));

    expect(result.entities.map(({ entityId }) => entityId)).toEqual([
      "job:billing",
      "integration:stripe",
    ]);
    expect(
      result.entities[0]?.requirements.find(
        ({ field }) => field === "criticality",
      )?.status,
    ).toBe("satisfied");
    expect(
      result.entities[0]?.requirements.find(
        ({ field }) => field === "recoveryProcedure",
      )?.status,
    ).toBe("missing");
    expect(
      result.entities[1]?.requirements.find(
        ({ field }) => field === "failureBehavior",
      )?.status,
    ).toBe("satisfied");
    expect(
      result.entities[1]?.requirements.find(
        ({ field }) => field === "externalOwner",
      )?.status,
    ).toBe("missing");
  });
});

function completeState(): HandoverState {
  return {
    schemaVersion: 1,
    entities: [consumer],
    knowledge: [
      { entityId: consumer.id, field: "criticality", value: "critical" },
      {
        entityId: consumer.id,
        field: "failureBehavior",
        value: "Dead-letters",
      },
      {
        entityId: consumer.id,
        field: "recoveryProcedure",
        value: "Replay the DLQ",
      },
      { entityId: consumer.id, field: "operationalOwner", value: "Platform" },
    ],
  };
}

async function projectWithState(state: HandoverState): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-audit-"));
  await writeHandoverState(directory, state);
  return directory;
}
