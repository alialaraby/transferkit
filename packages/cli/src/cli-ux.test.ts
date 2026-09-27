import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "./index.js";
import { renderEvidence } from "./evidence.js";
import { readTransferState } from "./transfer-state.js";

describe("CLI experience", () => {
  it.each([
    { args: ["--help"], text: "tk handover <command>" },
    { args: ["handover", "--help"], text: "evidence" },
    { args: ["onboard", "--help"], text: "not-started" },
  ])("provides useful help for $args", async ({ args, text }) => {
    const result = await command(process.cwd(), args);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout.join("\n")).toContain(text);
  });

  it("uses a distinct exit code for invalid usage", async () => {
    const result = await command(process.cwd(), ["handover", "unknown"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr[0]).toContain("Error: unknown command");
  });

  it("shows the v3 handover workflow without legacy commands", async () => {
    const result = await command(process.cwd(), ["handover", "--help"]);
    const help = result.stdout.join("\n");
    for (const name of ["init", "scan", "plan", "sync", "status", "evidence"])
      expect(help).toMatch(new RegExp(`^  ${name}\\b`, "mu"));
    expect(help).toContain(
      "init → scan → plan → edit HANDOVER.md → sync → status",
    );
    for (const name of [
      "start",
      "next",
      "resume",
      "revisit",
      "add-topic",
      "interview",
      "audit",
      "export",
      "flow",
    ])
      expect(help).not.toMatch(new RegExp(`^  ${name}\\b`, "mu"));
  });

  it.each([
    "start",
    "next",
    "resume",
    "revisit",
    "add-topic",
    "interview",
    "audit",
    "export",
    "flow",
  ])(
    "routes legacy %s to a migration message without touching state",
    async (name) => {
      const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
      await mkdir(join(directory, ".transferkit"));
      const legacy = '{"schemaVersion":1,"entities":[],"knowledge":[]}\n';
      await writeFile(join(directory, ".transferkit/handover.json"), legacy);
      const result = await command(directory, ["handover", name]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toEqual([
        "This command belongs to the legacy Handover workflow. Use: tk handover plan",
      ]);
      expect(
        await readFile(join(directory, ".transferkit/handover.json"), "utf8"),
      ).toBe(legacy);
    },
  );

  it("reports the legacy migration message for export --single", async () => {
    const result = await command(process.cwd(), [
      "handover",
      "export",
      "--single",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr[0]).toContain("Use: tk handover plan");
  });

  it("reports corrupt state without a raw stack trace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
    await mkdir(join(directory, ".transferkit"));
    await writeFile(join(directory, ".transferkit/handover.json"), "{broken");

    const result = await command(directory, ["onboard", "plan"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toEqual([
      "Error: Invalid TransferKit state in .transferkit/handover.json",
    ]);
    expect(result.stderr.join("\n")).not.toContain("at ");
  });

  it("reports malformed repository configuration concisely", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
    await writeFile(join(directory, "package.json"), "{broken");

    const result = await command(directory, ["handover", "scan"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toMatch(/^Error: Malformed package\.json:/u);
    expect(result.stderr.join("\n")).not.toContain("RepositoryScanError");
  });

  it("uses Transfer state for scan, plan, and status while leaving old state untouched", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
    await mkdir(join(directory, ".transferkit"));
    const legacy = '{"schemaVersion":1,"entities":[],"knowledge":[]}\n';
    await writeFile(join(directory, ".transferkit/handover.json"), legacy);
    await writeFile(join(directory, "package.json"), '{"name":"v3-example"}');
    expect((await command(directory, ["handover", "init"])).exitCode).toBe(0);
    const scan = await command(directory, ["handover", "scan"]);
    expect(scan.exitCode).toBe(0);
    expect(scan.stdout[0]).toContain("suggestions pending review");
    expect(await readTransferState(directory)).toBeDefined();
    expect((await command(directory, ["handover", "plan"])).exitCode).toBe(0);
    expect((await command(directory, ["handover", "sync"])).exitCode).toBe(0);
    const status = await command(directory, ["handover", "status"]);
    expect(status.exitCode).toBe(0);
    expect(status.stdout[0]).toContain("v3-example Handover");
    expect(status.stdout[0]).toContain("complete");
    expect(
      await readFile(join(directory, ".transferkit/handover.json"), "utf8"),
    ).toBe(legacy);
  });

  it("does not fall back to v2 status when only legacy state exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
    await mkdir(join(directory, ".transferkit"));
    await writeFile(
      join(directory, ".transferkit/handover.json"),
      '{"schemaVersion":1,"entities":[],"knowledge":[]}',
    );
    const result = await command(directory, ["handover", "status"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr[0]).toContain("Use: tk handover plan");
  });

  it("inspects finding evidence with source locations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
    await writeFile(
      join(directory, "package.json"),
      '{\n  "name": "sample",\n  "dependencies": {\n    "pg": "1.0.0"\n  }\n}\n',
    );

    const result = await command(directory, ["handover", "evidence"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("database: PostgreSQL");
    expect(result.stdout[0]).toContain("package.json:4 — Dependency pg@1.0.0");
  });

  it("renders missing and partial evidence safely", () => {
    expect(
      renderEvidence([
        { id: "one", kind: "integration", data: {}, evidence: [] },
        {
          id: "two",
          kind: "integration",
          data: {},
          evidence: [{ file: "src/example.ts" }],
        },
      ]),
    ).toContain("(no evidence recorded)");
    expect(
      renderEvidence([
        {
          id: "two",
          kind: "integration",
          data: {},
          evidence: [{ file: "src/example.ts" }],
        },
      ]),
    ).toContain("src/example.ts — Evidence recorded");
  });
});

async function command(cwd: string, args: readonly string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const environment: CliEnvironment = {
    cwd,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  };
  return { exitCode: await runCli(args, environment), stdout, stderr };
}
