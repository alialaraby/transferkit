import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { scanRepository } from "./index.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/realistic-nestjs",
);

describe("realistic NestJS repository scan", () => {
  it("discovers the combined backend architecture with source evidence", async () => {
    const findings = await scanRepository(fixture);
    const kinds = new Set(findings.map(({ kind }) => kind));

    expect(kinds).toEqual(
      new Set([
        "technology",
        "language",
        "framework",
        "messaging",
        "database",
        "orm",
        "messaging.consumer",
        "scheduled-job",
        "database.configuration",
        "database.entity",
        "integration",
        "environment.variable",
        "configuration",
        "environment.template",
        "containerization",
        "ci.workflow",
      ]),
    );
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "messaging.consumer",
          data: expect.objectContaining({
            queue: "shipment-workers",
            routingKey: "shipment.created",
          }),
        }),
        expect.objectContaining({
          kind: "scheduled-job",
          data: expect.objectContaining({ schedule: "0 */6 * * *" }),
        }),
        expect.objectContaining({
          kind: "integration",
          data: expect.objectContaining({
            endpoint: "https://partner.example.test/shipments",
          }),
        }),
        expect.objectContaining({
          kind: "ci.workflow",
          data: { name: "Test and build", provider: "GitHub Actions" },
        }),
      ]),
    );
    expect(
      findings.every(
        ({ evidence }) =>
          evidence.length > 0 && evidence.every(({ file }) => file.length > 0),
      ),
    ).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("example:example");
  });
});
