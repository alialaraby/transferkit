import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  detectProject,
  discoverRabbitMqConsumers,
  scanRepository,
} from "./index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/project-detection",
);
const consumerFixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rabbitmq-consumers",
);

describe("detectProject", () => {
  it("detects supported Node.js, TypeScript, NestJS, and RabbitMQ metadata", async () => {
    const findings = await detectProject(join(fixtures, "supported"));

    expect(findings.map((finding) => finding.id)).toEqual([
      "technology.nodejs",
      "language.typescript",
      "framework.nestjs",
      "messaging.rabbitmq",
    ]);
    expect(findings.every((finding) => finding.evidence.length > 0)).toBe(true);
  });

  it("detects only Node.js in a plain Node.js project", async () => {
    const findings = await detectProject(join(fixtures, "plain-node"));

    expect(findings.map((finding) => finding.id)).toEqual([
      "technology.nodejs",
    ]);
  });

  it("returns no findings when package.json is missing", async () => {
    await expect(
      detectProject(join(fixtures, "missing-package")),
    ).resolves.toEqual([]);
  });

  it("reports malformed package.json clearly", async () => {
    await expect(
      detectProject(join(fixtures, "malformed-package")),
    ).rejects.toThrow("Malformed package.json");
  });

  it("does not infer RabbitMQ from generic NestJS microservices", async () => {
    const findings = await detectProject(join(fixtures, "nest-microservices"));

    expect(findings.map((finding) => finding.id)).toEqual([
      "technology.nodejs",
      "framework.nestjs",
    ]);
  });
});

describe("discoverRabbitMqConsumers", () => {
  it("discovers one consumer and ignores unrelated decorators", () => {
    const findings = discoverRabbitMqConsumers(
      join(consumerFixtures, "single"),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "messaging.consumer",
      data: {
        name: "handleShipmentUpdate",
        queue: "shipment-webhooks",
        exchange: "shipment",
        routingKey: "shipment.updated",
      },
      evidence: [
        {
          file: "src/shipment.consumer.ts",
          line: 9,
        },
      ],
    });
  });

  it("discovers multiple consumers, including an aliased decorator import", () => {
    const findings = discoverRabbitMqConsumers(
      join(consumerFixtures, "multiple"),
    );

    expect(findings.map((finding) => finding.data.name)).toEqual([
      "billOrder",
      "refundOrder",
    ]);
  });

  it("keeps statically available metadata and safely skips dynamic metadata", () => {
    const findings = discoverRabbitMqConsumers(
      join(consumerFixtures, "missing-metadata"),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.data).toEqual({
      name: "notify",
      exchange: "notifications",
    });
  });

  it("includes consumers in a complete repository scan", async () => {
    const findings = await scanRepository(join(fixtures, "supported"));

    expect(findings.map((finding) => finding.kind)).toContain(
      "messaging.consumer",
    );
  });
});
