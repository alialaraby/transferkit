import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  detectProject,
  discoverRepositoryFiles,
  discoverScheduledJobs,
  discoverSourceFeatures,
  scanRepository,
} from "./index.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures",
);
const supported = join(fixtures, "milestone-four");
const negative = join(fixtures, "milestone-four-negative");

describe("Milestone 4 discovery", () => {
  it("discovers NestJS scheduled jobs with static schedules and skips dynamic values", () => {
    const jobs = discoverScheduledJobs(supported);
    expect(jobs.map((job) => job.data)).toEqual([
      {
        name: "Jobs.hourly",
        handler: "hourly",
        type: "cron",
        schedule: "0 * * * *",
      },
      { name: "Jobs.poll", handler: "poll", type: "interval", schedule: 5000 },
      { name: "Jobs.warmup", handler: "warmup", type: "timeout" },
    ]);
    expect(jobs[0]?.id).toBe("scheduled-job:src/features.ts:Jobs.hourly");
    expect(jobs[0]?.evidence[0]).toMatchObject({
      file: "src/features.ts",
      line: 19,
    });
    expect(discoverScheduledJobs(negative)).toEqual([]);
  });

  it("keeps database technology separate from the ORM", async () => {
    const technologies = await detectProject(supported);
    expect(technologies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "orm.typeorm",
          kind: "orm",
          data: { name: "TypeORM" },
        }),
        expect.objectContaining({
          id: "database.postgresql",
          kind: "database",
          data: { name: "PostgreSQL" },
        }),
      ]),
    );
    const typeormOnly = await detectProject(negative);
    expect(typeormOnly.map((finding) => finding.id)).toContain("orm.typeorm");
    expect(typeormOnly.map((finding) => finding.id)).not.toContain(
      "database.postgresql",
    );
  });

  it("discovers TypeORM configuration and entities", () => {
    const findings = discoverSourceFeatures(supported);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "database.configuration",
          data: { orm: "TypeORM", databaseType: "postgres" },
        }),
        expect.objectContaining({
          kind: "database",
          data: { name: "PostgreSQL" },
        }),
        expect.objectContaining({
          kind: "database.entity",
          data: { name: "Shipment", orm: "TypeORM" },
        }),
      ]),
    );
  });

  it("discovers outbound clients and only records static endpoints", async () => {
    const findings = [
      ...discoverSourceFeatures(supported),
      ...(await discoverRepositoryFiles(supported)),
    ].filter((finding) => finding.kind === "integration");
    expect(findings.map((finding) => finding.data)).toEqual(
      expect.arrayContaining([
        { client: "axios", endpoint: "https://example.test/shipments" },
        { client: "fetch" },
        {
          client: "NestJS HttpService",
          endpoint: "https://hooks.example.test",
        },
        { client: "stripe", service: "Stripe" },
      ]),
    );
    expect(
      discoverSourceFeatures(negative).filter(
        (finding) => finding.kind === "integration",
      ),
    ).toEqual([]);
  });

  it("discovers environment and NestJS configuration references without values", () => {
    const findings = discoverSourceFeatures(supported);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "environment.variable",
          data: { name: "DATABASE_URL" },
        }),
        expect.objectContaining({
          kind: "configuration",
          data: { key: "PARTNER_TOKEN", framework: "NestJS Config" },
        }),
      ]),
    );
    expect(JSON.stringify(findings)).not.toContain("PARTNER_TOKEN=");
  });

  it("discovers env templates, Docker files, and GitHub Actions workflows", async () => {
    const findings = await discoverRepositoryFiles(supported);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "environment.template",
          data: { name: ".env.example" },
        }),
        expect.objectContaining({
          kind: "containerization",
          data: { technology: "Docker", file: "Dockerfile" },
        }),
        expect.objectContaining({
          kind: "containerization",
          data: { technology: "Docker", file: "docker-compose.yaml" },
        }),
        expect.objectContaining({
          kind: "ci.workflow",
          data: { name: "CI", provider: "GitHub Actions" },
        }),
      ]),
    );
    expect(await discoverRepositoryFiles(negative)).toEqual([]);
  });

  it("includes all discovery categories in the repository scan", async () => {
    const kinds = (await scanRepository(supported)).map(
      (finding) => finding.kind,
    );
    expect(kinds).toEqual(
      expect.arrayContaining([
        "scheduled-job",
        "database",
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
  });
});
