import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateOnboardingWorkspace } from "./generate-onboarding-workspace.js";
import { generateOnboardingGuide } from "./generate-onboarding-guide.js";
import {
  setPersonalExerciseStatus,
  syncPersonalOnboarding,
} from "./personal-onboarding-sync.js";
import { runCli } from "./index.js";

const sections = [
  ["system-overview", "## System overview\nObserved entry point."],
  ["explained-flow", "## Explained flow\n### Example flow\nStatic trace."],
  [
    "setup-and-operations",
    "## Setup and operations\nDocumented, runtime unverified.",
  ],
  ["unknowns", "## Unknowns\nRuntime behavior is unknown."],
] as const;

async function fixture(extraLines = ""): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tk-workspace-"));
  const guide = sections
    .map(
      ([id, body]) =>
        `<!-- tk:onboard:section ${id} begin -->\n${body}${id === "system-overview" ? extraLines : ""}\n<!-- tk:onboard:section ${id} end -->`,
    )
    .join("\n\n");
  await writeFile(
    join(directory, "ONBOARDING.md"),
    `# Shared guide\n\n${guide}\n`,
  );
  return directory;
}

async function workspace(directory: string): Promise<string> {
  return readFile(join(directory, ".transferkit.local/ONBOARDING.md"), "utf8");
}

describe("personal onboarding workspace", () => {
  it("keeps exercise IDs stable across guide line shifts and links to present sections", async () => {
    const first = await fixture();
    const shifted = await fixture("\nAdded guide prose.\nAnother line.");
    await generateOnboardingWorkspace(first);
    await generateOnboardingWorkspace(shifted);
    const ids = (value: string) =>
      [...value.matchAll(/<!-- tk:onboard:exercise ([^ ]+) -->/gu)].map(
        (match) => match[1],
      );
    expect(ids(await workspace(first))).toEqual([
      "v2:understand-system",
      "v2:trace-flow",
      "v2:attempt-local-run",
      "v2:identify-ownership-gaps",
    ]);
    expect(ids(await workspace(shifted))).toEqual(ids(await workspace(first)));
    for (const id of sections.map(([section]) => section))
      expect(await workspace(first)).toContain(`../ONBOARDING.md#${id}`);
  });

  it("works without handover and leaves legacy JSON progress unchanged", async () => {
    const directory = await fixture();
    await mkdir(join(directory, ".transferkit.local"));
    const progress =
      '{"schemaVersion":1,"tasks":[{"taskId":"understand-system:legacy","status":"completed"}]}\n';
    await writeFile(
      join(directory, ".transferkit.local/onboarding-progress.json"),
      progress,
    );
    await generateOnboardingWorkspace(directory);
    const output = await workspace(directory);
    expect(output).toContain("Check one explained static flow");
    expect(output).toContain(
      "documented commands are runtime unverified until tried",
    );
    expect(output).toContain(
      "| Date | Exact command or safe check | Observed result | Blocker |",
    );
    expect(output).not.toContain("legacy");
    expect(
      await readFile(
        join(directory, ".transferkit.local/onboarding-progress.json"),
        "utf8",
      ),
    ).toBe(progress);
  });

  it("refuses to overwrite edited personal Markdown", async () => {
    const directory = await fixture();
    await generateOnboardingWorkspace(directory);
    const edited = `${await workspace(directory)}\nMy private note.\n`;
    await writeFile(
      join(directory, ".transferkit.local/ONBOARDING.md"),
      edited,
    );
    await expect(generateOnboardingWorkspace(directory)).rejects.toThrow(
      /already exists; it was left untouched/u,
    );
    expect(await workspace(directory)).toBe(edited);
  });

  it("preserves a dated personal attempt observation through sync", async () => {
    const directory = await fixture();
    await generateOnboardingWorkspace(directory);
    const recorded = (await workspace(directory)).replace(
      "|  |  |  |  |",
      "| 2026-10-01 | npm run start | Connection refused | Database unavailable |",
    );
    await writeFile(
      join(directory, ".transferkit.local/ONBOARDING.md"),
      recorded,
    );
    await syncPersonalOnboarding(directory);
    expect(await workspace(directory)).toContain(
      "| 2026-10-01 | npm run start | Connection refused | Database unavailable |",
    );
  });

  it("keeps stable progress and notes while flagging a disappeared guide journey", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-workspace-stale-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-phase4",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    await generateOnboardingWorkspace(directory);
    const personalFile = join(directory, ".transferkit.local/ONBOARDING.md");
    const original = await workspace(directory);
    expect(original).toContain(
      "ParcelController.dispatch and ParcelJobs.inspect",
    );
    await writeFile(personalFile, `${original}\nMy own source notes.\n`);
    await setPersonalExerciseStatus(directory, "v2:trace-flow", "completed");
    const retained = await workspace(directory);
    const planOutputs: string[] = [];
    expect(
      await runCli(["onboard", "plan"], {
        cwd: directory,
        stdout: (value) => planOutputs.push(value),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(planOutputs.join("\n")).toContain(
      "Focus: Explain ParcelController.dispatch and ParcelJobs.inspect",
    );
    const shared = await readFile(join(directory, "ONBOARDING.md"), "utf8");
    await writeFile(
      join(directory, "ONBOARDING.md"),
      shared.replaceAll(
        "### Source journey: ParcelJobs.inspect",
        "### Source journey: ParcelJobs.changed",
      ),
    );
    const outputs: string[] = [];
    expect(
      await runCli(["onboard", "status"], {
        cwd: directory,
        stdout: (value) => outputs.push(value),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(outputs.join("\n")).toContain(
      "Stale guide link: ParcelJobs.inspect",
    );
    expect(outputs.join("\n")).toContain("Trace a flow: completed");
    expect(await workspace(directory)).toBe(retained);
    expect(retained).toContain("My own source notes.");
  });

  it("requires a marked shared guide", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-workspace-no-guide-"));
    await expect(generateOnboardingWorkspace(directory)).rejects.toThrow(
      /tk onboard guide/u,
    );
  });
});
