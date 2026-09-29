import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateOnboardingWorkspace } from "./generate-onboarding-workspace.js";

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

  it("requires a marked shared guide", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-workspace-no-guide-"));
    await expect(generateOnboardingWorkspace(directory)).rejects.toThrow(
      /tk onboard guide/u,
    );
  });
});
