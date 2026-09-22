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
    expect(findings).toEqual([
      {
        id: "technology.nodejs",
        kind: "technology",
        data: { name: "Node.js" },
        evidence: [
          {
            file: "package.json",
            line: 1,
            description: "package.json identifies this as a Node.js package",
          },
        ],
      },
      {
        id: "language.typescript",
        kind: "language",
        data: { name: "TypeScript" },
        evidence: [
          {
            file: "tsconfig.json",
            line: 1,
            description: "TypeScript configuration is present",
          },
          {
            file: "package.json",
            line: 8,
            description: "Dependency typescript@^5.9.0 is declared",
          },
        ],
      },
      {
        id: "framework.nestjs",
        kind: "framework",
        data: { name: "NestJS" },
        evidence: [
          {
            file: "package.json",
            line: 5,
            description: "Dependency @nestjs/core@^11.0.0 is declared",
          },
        ],
      },
      {
        id: "messaging.rabbitmq",
        kind: "messaging",
        data: { name: "RabbitMQ" },
        evidence: [
          {
            file: "package.json",
            line: 4,
            description:
              "Dependency @golevelup/nestjs-rabbitmq@^5.7.0 is declared",
          },
        ],
      },
    ]);
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
      id: "messaging.consumer:src/shipment.consumer.ts:ShipmentConsumer.handleShipmentUpdate",
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
          line: 4,
          description:
            "RabbitSubscribe decorator marks this method as a RabbitMQ consumer",
        },
        {
          file: "src/shipment.consumer.ts",
          line: 1,
          description:
            "RabbitSubscribe is imported from @golevelup/nestjs-rabbitmq",
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
    expect(findings.map((finding) => finding.id)).toEqual([
      "messaging.consumer:src/consumers.ts:Consumers.billOrder",
      "messaging.consumer:src/consumers.ts:Consumers.refundOrder",
    ]);
    expect(findings.every((finding) => finding.evidence.length === 2)).toBe(
      true,
    );
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
