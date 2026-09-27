import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { CliEnvironment } from "./cli.js";
import { runLegacyCli as runCli } from "./legacy-cli.test-helper.js";
import { readHandoverState, writeHandoverState } from "./handover-state.js";
import { loadGuidedHandover } from "./guided-handover.js";

async function project(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-guided-"));
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "guided-example", dependencies: { pg: "1.0.0" } }),
  );
  return directory;
}

async function command(cwd: string, args: string[], answers: string[] = []) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const environment: CliEnvironment = {
    cwd,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    prompt: async () => answers.shift() ?? "save",
  };
  return {
    exitCode: await runCli(args, environment),
    text: stdout.join("\n"),
    stderr,
  };
}

describe("guided handover commands", () => {
  it("keeps a recorded note incomplete across status, audit, export, and resume until confirmation", async () => {
    const cwd = await project();
    const saved = await command(
      cwd,
      ["handover", "next"],
      ["1: handled manually", "no"],
    );
    expect(saved.text).toContain("Still incomplete");
    expect((await command(cwd, ["handover", "status"])).text).toContain(
      "System Overview 0/1",
    );
    expect((await command(cwd, ["handover", "audit"])).text).toContain(
      "recorded, awaiting confirmation Purpose and users",
    );
    await command(cwd, ["handover", "export"]);
    const exported = await readFile(
      join(cwd, ".transferkit/handover/system-overview.md"),
      "utf8",
    );
    expect(exported).toContain("recorded; coverage incomplete");
    await command(cwd, ["handover", "next"], ["save"]);
    expect((await readHandoverState(cwd)).guided?.session?.status).toBe(
      "paused",
    );
    const resumed = await command(cwd, ["handover", "resume"], ["confirm"]);
    expect(resumed.text).toContain("Marked 1 recorded topic covered");
    expect((await command(cwd, ["handover", "status"])).text).toContain(
      "System Overview 1/1",
    );
    expect((await command(cwd, ["handover", "audit"])).text).toContain(
      "✓ covered (human) Purpose and users",
    );
  });
  it("shows inferred integration identity as unconfirmed with configuration context", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "transferkit-inferred-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        name: "identity-fixture",
        dependencies: { axios: "1.0.0", "@nestjs/config": "1.0.0" },
      }),
    );
    await writeFile(
      join(cwd, "nafath.ts"),
      `import axios from 'axios'; import { ConfigService } from '@nestjs/config'; class NafathApiService { constructor(private config: ConfigService) {} verify() { return axios.post(this.config.get('NAFATH_BASE_URL')); } }`,
    );
    const plan = (await loadGuidedHandover(cwd)).plan;
    const state = await readHandoverState(cwd);
    state.guided = {
      customTopics: [],
      skipped: [],
      notApplicable: plan.areas.flatMap((area) =>
        area.id === "external-integrations"
          ? []
          : area.requirements.map(({ id }) => id),
      ),
    };
    await writeHandoverState(cwd, state);
    const next = await command(cwd, ["handover", "next"], ["save"]);
    expect(next.text).toContain("Integration: NAFATH (inferred, unconfirmed)");
    expect(next.text).toContain("Suggested, unconfirmed:");
    expect(next.text).toContain("Configuration keys: NAFATH_BASE_URL");
  });
  it("keeps unscoped notes uncovered and maps partial grouped answers to only their named requirements", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "transferkit-grouped-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/realistic-nestjs",
      ),
      cwd,
      { recursive: true },
    );
    const plan = (await loadGuidedHandover(cwd)).plan;
    const state = await readHandoverState(cwd);
    state.guided = {
      customTopics: [],
      skipped: [],
      notApplicable: plan.areas.flatMap((area) =>
        area.id === "scheduled-jobs"
          ? []
          : area.requirements.map(({ id }) => id),
      ),
    };
    await writeHandoverState(cwd, state);
    const generic = await command(
      cwd,
      ["handover", "next"],
      ["The job is important"],
    );
    expect(generic.text).toContain("Saved as context");
    expect((await readHandoverState(cwd)).guided?.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "The job is important" }),
      ]),
    );
    const before = await command(cwd, ["handover", "status"]);
    expect(before.text).toContain("Scheduled Jobs 2/14");
    const mapped = await command(
      cwd,
      ["handover", "next"],
      [
        "1: Reconcile delayed shipments | 2: Prevent overlapping runs with a lease",
        "yes",
      ],
    );
    expect(mapped.text).toContain("Saved 2 mapped topics");
    const after = await command(cwd, ["handover", "status"]);
    expect(after.text).toContain("Scheduled Jobs 4/14");
    const audit = await command(cwd, ["handover", "audit"]);
    expect(audit.text).toContain(
      "✓ covered (human) ShipmentJobs.reconcileShipments: Job purpose and business impact",
    );
    expect(audit.text).toContain(
      "✓ covered (human) ShipmentJobs.reconcileShipments: Overlap and concurrency",
    );
    expect(audit.text).toContain(
      "✗ missing human knowledge ShipmentJobs.reconcileShipments: Idempotency and safe rerun",
    );
  });

  it("does not cover critical flows with a broad note", async () => {
    const cwd = await project();
    const plan = (await loadGuidedHandover(cwd)).plan;
    const state = await readHandoverState(cwd);
    state.guided = {
      customTopics: [],
      skipped: [],
      notApplicable: plan.areas.flatMap((area) =>
        area.id === "critical-business-flows"
          ? []
          : area.requirements.map(({ id }) => id),
      ),
    };
    await writeHandoverState(cwd, state);
    await command(cwd, ["handover", "next"], ["1: Payment flow is important"]);
    expect((await command(cwd, ["handover", "status"])).text).toContain(
      "Critical Business Flows 0/1",
    );
  });
  it("starts from standard areas with detected context and deterministic coverage", async () => {
    const cwd = await project();
    const result = await command(cwd, ["handover", "start"]);
    expect(result.exitCode).toBe(0);
    expect(result.text).toContain("24 areas");
    expect(result.text).toContain("Detected context: PostgreSQL");
    expect(result.text).toContain("Critical coverage:");
    expect(result.text).toContain("Critical remaining areas:");
    expect(result.text).toContain("Begin with System Overview");
  });

  it("persists an incremental session across commands and rescans", async () => {
    const cwd = await project();
    await command(cwd, ["handover", "start"]);
    expect((await readHandoverState(cwd)).guided?.session).toMatchObject({
      status: "active",
      currentTopicId: "system-overview.purpose",
      completedTopicIds: [],
    });
    await command(cwd, ["handover", "next"], ["save"]);
    expect((await readHandoverState(cwd)).guided?.session?.status).toBe(
      "paused",
    );
    await command(cwd, ["handover", "scan"]);
    await command(
      cwd,
      ["handover", "resume"],
      ["1: This project manages merchant settlement", "yes"],
    );
    expect((await readHandoverState(cwd)).guided?.session).toMatchObject({
      status: "active",
      completedTopicIds: ["system-overview.purpose"],
    });
    const status = await command(cwd, ["handover", "status"]);
    expect(status.text).toContain("Session: active · 1 topics addressed");
    expect(status.text).toContain("Next: Architecture");
  });

  it("saves a guided note and resumes at the next topic after a rescan", async () => {
    const cwd = await project();
    const first = await command(
      cwd,
      ["handover", "next"],
      ["1: This system handles merchant settlement", "yes"],
    );
    expect(first.text).toContain("System Overview");
    expect(first.text).toContain("Why it matters:");
    expect(first.text).toContain("Useful knowledge to transfer:");
    expect((await readHandoverState(cwd)).knowledge).toContainEqual({
      entityId: "system-overview.purpose",
      field: "content",
      value: "This system handles merchant settlement",
    });
    await command(cwd, ["handover", "scan"]);
    const resumed = await command(cwd, ["handover", "resume"], ["save"]);
    expect(resumed.text).toContain("Architecture");
    const status = await command(cwd, ["handover", "status"]);
    expect(status.text).toContain("System Overview 1/1");
    expect(status.text).toContain("Architecture 0/1");
  });

  it("persists skip and not-applicable decisions and accepts a custom topic", async () => {
    const cwd = await project();
    await command(cwd, ["handover", "next"], ["skip"]);
    expect((await readHandoverState(cwd)).guided?.skipped).toContain(
      "system-overview.purpose",
    );
    const skippedAudit = await command(cwd, ["handover", "audit"]);
    expect(skippedAudit.text).toContain("– skipped Purpose and users");
    const revisit = await command(
      cwd,
      ["handover", "revisit"],
      ["1: The system handles merchant settlement", "yes"],
    );
    expect(revisit.text).toContain("System Overview");
    expect((await readHandoverState(cwd)).guided?.skipped).not.toContain(
      "system-overview.purpose",
    );
    const next = await command(cwd, ["handover", "next"], ["n/a"]);
    expect(next.text).toContain("Architecture");
    expect((await readHandoverState(cwd)).guided?.notApplicable).toContain(
      "architecture.structure",
    );
    const added = await command(
      cwd,
      ["handover", "add-topic"],
      ["Monthly settlement"],
    );
    expect(added.text).toContain("Added Monthly settlement");
    expect((await readHandoverState(cwd)).guided?.customTopics).toContainEqual({
      id: "monthly-settlement",
      title: "Monthly settlement",
      priority: "recommended",
    });
    const status = await command(cwd, ["handover", "status"]);
    expect(status.text).toContain("Custom Topics 0/1");
    expect(status.text).toContain("Skipped: 0 · Not applicable: 1");
    const audit = await command(cwd, ["handover", "audit"]);
    expect(audit.text).toContain(
      "○ not applicable Major components and boundaries",
    );
    expect(audit.text).toContain("Critical gaps:");
  });

  it("rejects secret-like notes without persisting them", async () => {
    const cwd = await project();
    const result = await command(
      cwd,
      ["handover", "next"],
      ["API_KEY=abcdefghijklmnop", "save"],
    );
    expect(result.text).toContain("resembles a secret and was not saved");
    expect(
      await readFile(join(cwd, ".transferkit", "handover.json"), "utf8"),
    ).not.toContain("abcdefghijklmnop");
  });
});
