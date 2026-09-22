import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { HandoverState } from "@transferkit/core";

import { runCli } from "./cli.js";
import {
  exportHandover,
  handoverExportDirectoryName,
  messagingExportFileName,
  singleFileExportName,
} from "./export-handover.js";
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

  it("generates a concise multi-domain package", async () => {
    const value = richState();
    const directory = await projectWithState(value);

    await exportHandover(directory);

    expect(await exportedFiles(directory)).toEqual([
      "architecture.md",
      "data.md",
      "deployment.md",
      "integrations.md",
      "messaging.md",
      "operations.md",
      "overview.md",
      "ownership.md",
      "risks.md",
    ]);
    expect(
      await readFile(
        join(directory, handoverExportDirectoryName, "data.md"),
        "utf8",
      ),
    ).toContain("**Critical data / tables:** Orders and payments");
    expect(
      await readFile(
        join(directory, handoverExportDirectoryName, "integrations.md"),
        "utf8",
      ),
    ).toContain("**Business importance:** Payment processing");
    expect(
      await readFile(
        join(directory, handoverExportDirectoryName, "risks.md"),
        "utf8",
      ),
    ).toContain("rollback procedure");
  });

  it("generates only documents justified by available capabilities", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [
        {
          id: "configuration:runtime",
          kind: "configuration",
          name: "Runtime configuration",
        },
      ],
      knowledge: [
        {
          entityId: "configuration:runtime",
          field: "environmentDifferences",
          value: "Production uses managed services",
        },
        {
          entityId: "configuration:runtime",
          field: "requiredConfiguration",
          value: "Region must be configured",
        },
      ],
    });

    await exportHandover(directory);

    expect(await exportedFiles(directory)).toEqual([
      "operations.md",
      "overview.md",
      "ownership.md",
    ]);
  });

  it("removes stale generated documents but preserves unrelated files", async () => {
    const directory = await projectWithState(richState());
    await exportHandover(directory);
    await writeFile(
      join(directory, handoverExportDirectoryName, "notes.md"),
      "keep\n",
      "utf8",
    );
    await writeHandoverState(directory, state());

    await exportHandover(directory);

    expect(await exportedFiles(directory)).toEqual([
      "messaging.md",
      "notes.md",
      "overview.md",
      "ownership.md",
    ]);
  });

  it("redacts secret assignments from human knowledge", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [
        {
          id: "configuration:runtime",
          kind: "configuration",
          name: "Runtime configuration",
        },
      ],
      knowledge: [
        {
          entityId: "configuration:runtime",
          field: "environmentDifferences",
          value: "Production differs from staging",
        },
        {
          entityId: "configuration:runtime",
          field: "requiredConfiguration",
          value: "Set API_TOKEN=super-secret-value before startup",
        },
      ],
    });

    await exportHandover(directory);
    const operations = await readFile(
      join(directory, handoverExportDirectoryName, "operations.md"),
      "utf8",
    );

    expect(operations).toContain("API_TOKEN=[REDACTED]");
    expect(operations).not.toContain("super-secret-value");
  });

  it("supports deterministic single-file export through the CLI", async () => {
    const directory = await projectWithState(richState());
    const stdout: string[] = [];

    const exitCode = await runCli(["handover", "export", "--single"], {
      cwd: directory,
      stdout: (message) => stdout.push(message),
      stderr: () => undefined,
    });
    const first = await readFile(join(directory, singleFileExportName), "utf8");
    await exportHandover(directory, { single: true });

    expect(exitCode).toBe(0);
    expect(stdout[0]).toContain(singleFileExportName);
    expect(await readFile(join(directory, singleFileExportName), "utf8")).toBe(
      first,
    );
  });

  it("composes single-file output from the same ordered topic documents", async () => {
    const directory = await projectWithState(richState());
    await exportHandover(directory);
    await exportHandover(directory, { single: true });
    const single = await readFile(
      join(directory, singleFileExportName),
      "utf8",
    );

    for (const fileName of await exportedFiles(directory)) {
      const topic = await readFile(
        join(directory, handoverExportDirectoryName, fileName),
        "utf8",
      );
      expect(single).toContain(topic.trimEnd());
    }
    expect(single.indexOf("# System Overview")).toBeLessThan(
      single.indexOf("# Architecture"),
    );
    expect(single.indexOf("# Architecture")).toBeLessThan(
      single.indexOf("# Data"),
    );
  });
});

function richState(): HandoverState {
  const messaging = state();
  return {
    schemaVersion: 1,
    entities: [
      ...messaging.entities,
      {
        id: "job:billing",
        kind: "scheduled-job",
        name: "BillingJob.run",
        handler: "run",
      },
      {
        id: "database:postgresql",
        kind: "database",
        name: "PostgreSQL",
        technology: "PostgreSQL",
      },
      {
        id: "integration:stripe",
        kind: "integration",
        name: "Stripe",
        technology: "stripe",
      },
      {
        id: "configuration:runtime",
        kind: "configuration",
        name: "Runtime configuration",
      },
      {
        id: "containerization:docker",
        kind: "containerization",
        name: "Docker",
        technology: "Docker",
      },
      {
        id: "ci:workflow",
        kind: "ci.workflow",
        name: "CI",
        technology: "GitHub Actions",
      },
    ],
    knowledge: [
      ...messaging.knowledge,
      {
        entityId: "database:postgresql",
        field: "criticalData",
        value: "Orders and payments",
      },
      {
        entityId: "integration:stripe",
        field: "businessImportance",
        value: "Payment processing",
      },
    ],
  };
}

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

async function exportedFiles(directory: string): Promise<string[]> {
  return (await readdir(join(directory, handoverExportDirectoryName))).sort();
}
