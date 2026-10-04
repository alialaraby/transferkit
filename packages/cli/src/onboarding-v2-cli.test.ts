import { cp, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { runCli } from "./index.js";
import { planOnboarding } from "./plan-onboarding.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/milestone-four",
);

async function directory(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "tk-v2-cli-"));
  await cp(fixture, target, { recursive: true });
  return target;
}

async function command(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; output: string; errors: string }> {
  const output: string[] = [];
  const errors: string[] = [];
  const code = await runCli(args, {
    cwd,
    stdout: (message) => output.push(message),
    stderr: (message) => errors.push(message),
  });
  return { code, output: output.join("\n"), errors: errors.join("\n") };
}

describe("onboard v2 CLI display", () => {
  it("explains the intended command flow in help", async () => {
    const help = await command(process.cwd(), "onboard", "--help");
    expect(help.code).toBe(0);
    expect(help.output).toContain("Start: guide → workspace → plan");
  });

  it("shows four ordered v2 exercises with status, outcome, and guide link", async () => {
    const cwd = await directory();
    expect((await command(cwd, "onboard", "guide")).code).toBe(0);
    expect((await command(cwd, "onboard", "workspace")).code).toBe(0);
    expect(
      (
        await command(
          cwd,
          "onboard",
          "task",
          "v2:understand-system",
          "completed",
        )
      ).code,
    ).toBe(0);
    const plan = await command(cwd, "onboard", "plan");
    expect(plan.code).toBe(0);
    const ids = [
      "v2:understand-system",
      "v2:trace-flow",
      "v2:attempt-local-run",
      "v2:identify-ownership-gaps",
    ];
    const positions = ids.map((id) => plan.output.indexOf(id));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(plan.output).toContain("Understand the system [completed]");
    expect(plan.output).toContain("Goal: Write a short mental model");
    expect(plan.output).toContain("Read: ONBOARDING.md#system-overview");
    expect(plan.output).not.toContain("Review scheduled job");
  });

  it("leads status with v2 progress and questions, with legacy progress separate", async () => {
    const cwd = await directory();
    const legacyId = (await planOnboarding(cwd)).stages[0]!.tasks[0]!.id;
    expect(
      (await command(cwd, "onboard", "task", legacyId, "completed")).code,
    ).toBe(0);
    const legacyBefore = await readFile(
      join(cwd, ".transferkit.local/onboarding-progress.json"),
      "utf8",
    );
    await command(cwd, "onboard", "guide");
    await command(cwd, "onboard", "workspace");
    const personalFile = join(cwd, ".transferkit.local/ONBOARDING.md");
    await writeFile(
      personalFile,
      (await readFile(personalFile, "utf8")).replace(
        "_Add questions for a person or a runtime check._",
        "Who owns local recovery?",
      ),
    );
    const status = await command(cwd, "onboard", "status");
    expect(status.code).toBe(0);
    expect(status.output.startsWith("Onboarding progress")).toBe(true);
    expect(status.output).toContain(
      "Questions and unknowns\n- Personal: Who owns local recovery?",
    );
    expect(status.output).toContain("Legacy onboarding progress\n");
    expect(status.output.indexOf("Legacy onboarding progress")).toBeGreaterThan(
      status.output.indexOf("Questions and unknowns"),
    );
    expect(
      await readFile(
        join(cwd, ".transferkit.local/onboarding-progress.json"),
        "utf8",
      ),
    ).toBe(legacyBefore);
  });

  it("keeps the legacy plan and status when v2 files are absent or partial", async () => {
    const cwd = await directory();
    const plan = await command(cwd, "onboard", "plan");
    expect(plan.output).toContain("Legacy onboarding plan");
    expect(plan.output).toContain("Review scheduled job");
    expect(plan.output).toContain("tk onboard guide");
    const status = await command(cwd, "onboard", "status");
    expect(status.output).toContain("Legacy onboarding progress");
    expect(status.output).toContain("tk onboard workspace");
    await expect(stat(join(cwd, "ONBOARDING.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await command(cwd, "onboard", "guide");
    const partial = await command(cwd, "onboard", "plan");
    expect(partial.output).toContain("Legacy onboarding plan");
    expect(partial.output).toContain("tk onboard workspace");
    await expect(
      stat(join(cwd, ".transferkit.local/ONBOARDING.md")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
