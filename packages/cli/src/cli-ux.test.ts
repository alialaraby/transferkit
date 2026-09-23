import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "./index.js";
import { renderEvidence } from "./evidence.js";

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

  it("reports corrupt state without a raw stack trace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-cli-"));
    await mkdir(join(directory, ".transferkit"));
    await writeFile(join(directory, ".transferkit/handover.json"), "{broken");

    const result = await command(directory, ["handover", "audit"]);
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
