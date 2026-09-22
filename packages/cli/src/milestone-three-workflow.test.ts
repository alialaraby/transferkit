import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Finding } from "@transferkit/core";

import { handoverStateFileName, readHandoverState } from "./handover-state.js";
import { runCli, type CliEnvironment } from "./index.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/project-detection/supported",
);

describe("Milestone 3 RabbitMQ workflow", () => {
  it("runs the complete workflow safely and repeatably", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-workflow-"));
    await cp(fixture, directory, { recursive: true });
    await expect(stat(join(directory, ".transferkit"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const initialized = await command(directory, ["handover", "init"]);
    expect(initialized.exitCode).toBe(0);
    expect(initialized.stdout[0]).toContain("Initialized TransferKit");
    const projectState = await readFile(
      join(directory, ".transferkit/project.yaml"),
      "utf8",
    );
    expect(projectState).toContain('name: "supported-service"');

    const scanned = await command(directory, ["handover", "scan"]);
    expect(scanned.exitCode).toBe(0);
    const findings = scanFindings(scanned.stdout[0]);
    expect(findings.map(({ data }) => findingName(data))).toEqual([
      "Node.js",
      "TypeScript",
      "NestJS",
      "RabbitMQ",
      undefined,
    ]);
    const consumerFinding = findings.find(
      ({ kind }) => kind === "messaging.consumer",
    );
    expect(consumerFinding).toMatchObject({
      data: {
        name: "handleShipmentUpdate",
        queue: "shipment-webhooks",
        exchange: "shipment",
        routingKey: "shipment.updated",
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({ file: "src/shipment.consumer.ts", line: 4 }),
        expect.objectContaining({ file: "src/shipment.consumer.ts", line: 1 }),
      ]),
    });
    expect((await readHandoverState(directory)).entities).toMatchObject([
      {
        name: "shipment-webhooks",
        technology: "rabbitmq",
        handler: "handleShipmentUpdate",
      },
    ]);

    const interviewed = await command(
      directory,
      ["handover", "interview"],
      ["1", "Dead-letters after retries; replay from the DLQ", "skip"],
    );
    expect(interviewed.exitCode).toBe(0);
    const stateAfterInterview = await readHandoverState(directory);
    expect(stateAfterInterview.knowledge).toEqual([
      expect.objectContaining({ field: "criticality", value: "critical" }),
      expect.objectContaining({
        field: "failureBehavior",
        value: "Dead-letters after retries; replay from the DLQ",
      }),
      expect.objectContaining({
        field: "recoveryProcedure",
        value: "Dead-letters after retries; replay from the DLQ",
      }),
      expect.objectContaining({
        field: "operationalOwner",
        status: "skipped",
      }),
    ]);

    const audited = await command(directory, ["handover", "audit"]);
    expect(audited.exitCode).toBe(0);
    expect(audited.stdout[0]).toContain("✓ Criticality");
    expect(audited.stdout[0]).toContain("✓ Failure behavior");
    expect(audited.stdout[0]).toContain("✓ Recovery / replay procedure");
    expect(audited.stdout[0]).toContain("– Operational owner (skipped)");
    expect(audited.stdout[0]).toContain("3 / 4 critical requirements complete");

    const exported = await command(directory, ["handover", "export"]);
    expect(exported.exitCode).toBe(0);
    const markdownFile = join(directory, ".transferkit/handover/messaging.md");
    const markdown = await readFile(markdownFile, "utf8");
    expect(markdown).toContain("**Queue:** shipment-webhooks");
    expect(markdown).toContain(
      "**Failure behavior:** Dead-letters after retries; replay from the DLQ",
    );
    expect(markdown).toContain("**Operational owner:** _Missing (skipped)_");

    const onboarded = await command(directory, ["onboard", "plan"]);
    expect(onboarded.exitCode).toBe(0);
    expect(onboarded.stdout[0]).toContain("handler `handleShipmentUpdate`");
    expect(onboarded.stdout[0]).toContain("`shipment.updated` routing flow");
    expect(onboarded.stdout[0]).toContain(
      "Review documented failure behavior for `shipment-webhooks` — Dead-letters after retries; replay from the DLQ",
    );
    expect(onboarded.stdout[0]).toContain(
      "⚠ Operational owner for shipment-webhooks was not documented during handover.",
    );

    await expect(
      command(directory, ["handover", "scan"]),
    ).resolves.toMatchObject({ exitCode: 0 });
    const stateAfterRescan = await readHandoverState(directory);
    expect(stateAfterRescan.entities).toHaveLength(1);
    expect(stateAfterRescan.knowledge).toEqual(stateAfterInterview.knowledge);

    const stateBeforeRepeats = await readFile(
      join(directory, handoverStateFileName),
      "utf8",
    );
    const markdownBeforeRepeat = await readFile(markdownFile, "utf8");
    for (const args of [
      ["handover", "init"],
      ["handover", "scan"],
      ["handover", "audit"],
      ["handover", "export"],
      ["onboard", "plan"],
    ]) {
      await expect(command(directory, args)).resolves.toMatchObject({
        exitCode: 0,
        stderr: [],
      });
    }
    expect(await readFile(join(directory, handoverStateFileName), "utf8")).toBe(
      stateBeforeRepeats,
    );
    expect(await readFile(markdownFile, "utf8")).toBe(markdownBeforeRepeat);
    expect((await readHandoverState(directory)).entities).toHaveLength(1);
  });
});

interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

async function command(
  cwd: string,
  args: readonly string[],
  answers: readonly string[] = [],
): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let answerIndex = 0;
  const environment: CliEnvironment = {
    cwd,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    prompt: async () => answers[answerIndex++] ?? "",
  };
  return { exitCode: await runCli(args, environment), stdout, stderr };
}

function scanFindings(output: string | undefined): Finding[] {
  if (output === undefined) throw new Error("Scan did not produce output");
  const parsed: unknown = JSON.parse(output);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("findings" in parsed) ||
    !Array.isArray(parsed.findings)
  ) {
    throw new Error("Scan output did not contain findings");
  }
  return parsed.findings as Finding[];
}

function findingName(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("name" in data)) {
    return undefined;
  }
  return typeof data.name === "string" && /^[A-Z]/u.test(data.name)
    ? data.name
    : undefined;
}
