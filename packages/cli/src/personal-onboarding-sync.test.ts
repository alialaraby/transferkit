import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateOnboardingWorkspace } from "./generate-onboarding-workspace.js";
import {
  readPersonalOnboardingState,
  setPersonalExerciseStatus,
  syncPersonalOnboarding,
} from "./personal-onboarding-sync.js";
import { runCli } from "./index.js";

const id = "v2:understand-system";
const markdownName = ".transferkit.local/ONBOARDING.md";
const stateName = ".transferkit.local/onboarding-v2.json";

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tk-personal-sync-"));
  await writeFile(join(directory, "package.json"), '{"name":"sample"}');
  const sections = [
    "system-overview",
    "candidate-flows",
    "setup-and-operations",
    "unknowns",
  ];
  await writeFile(
    join(directory, "ONBOARDING.md"),
    sections
      .map(
        (section) =>
          `<!-- tk:onboard:section ${section} begin -->\n## ${section}\n<!-- tk:onboard:section ${section} end -->`,
      )
      .join("\n\n"),
  );
  await generateOnboardingWorkspace(directory);
  return directory;
}

async function read(directory: string, file: string): Promise<string> {
  return readFile(join(directory, file), "utf8");
}

async function editMarkdown(
  directory: string,
  edit: (source: string) => string,
): Promise<void> {
  await writeFile(
    join(directory, markdownName),
    edit(await read(directory, markdownName)),
  );
}

describe("personal Markdown and JSON synchronization", () => {
  it("imports a checked box and status reports self-reported v2 completion", async () => {
    const directory = await fixture();
    await editMarkdown(directory, (source) =>
      source.replace("- [ ] **Objective:**", "- [x] **Objective:**"),
    );
    const syncOutput: string[] = [];
    expect(
      await runCli(["onboard", "sync"], {
        cwd: directory,
        stdout: (message) => syncOutput.push(message),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(syncOutput[0]).toContain("1 checkbox change imported");
    expect(
      (await readPersonalOnboardingState(directory))?.exercises[0]?.status,
    ).toBe("completed");
    const output: string[] = [];
    expect(
      await runCli(["onboard", "status"], {
        cwd: directory,
        stdout: (message) => output.push(message),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(output.join("\n")).toContain(`completed (${id})`);
    expect(output.join("\n")).toContain("self-reported");
  });

  it("writes CLI status to only the matching checkbox and preserves prose", async () => {
    const directory = await fixture();
    await editMarkdown(
      directory,
      (source) => `${source}\n## My questions\n\nHuman note and evidence.\n`,
    );
    const cliOutput: string[] = [];
    expect(
      await runCli(["onboard", "task", id, "completed"], {
        cwd: directory,
        stdout: (message) => cliOutput.push(message),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(cliOutput[0]).toContain(`Updated ${id} to completed`);
    const markdown = await read(directory, markdownName);
    expect(markdown).toContain("- [x] **Objective:**");
    expect(markdown).toContain("## My questions\n\nHuman note and evidence.");
    expect(markdown.match(/- \[x\] \*\*Objective:\*\*/gu)).toHaveLength(1);
    await setPersonalExerciseStatus(directory, id, "in-progress");
    expect(await read(directory, markdownName)).toContain(
      "- [ ] **Objective:**",
    );
    expect(
      (await readPersonalOnboardingState(directory))?.exercises[0]?.status,
    ).toBe("in-progress");
  });

  it("propagates a JSON-only status edit to the checkbox on sync", async () => {
    const directory = await fixture();
    const state = JSON.parse(await read(directory, stateName)) as {
      exercises: { id: string; status: string }[];
    };
    state.exercises[0]!.status = "completed";
    await writeFile(join(directory, stateName), JSON.stringify(state));
    await syncPersonalOnboarding(directory);
    expect(await read(directory, markdownName)).toContain(
      "- [x] **Objective:**",
    );
    expect(
      (await readPersonalOnboardingState(directory))?.markdownSnapshot[id],
    ).toEqual({ status: "completed", checked: true });
  });

  it("reports both values and changes neither file on a same-exercise conflict", async () => {
    const directory = await fixture();
    await editMarkdown(directory, (source) =>
      source.replace("- [ ] **Objective:**", "- [x] **Objective:**"),
    );
    const state = JSON.parse(await read(directory, stateName)) as {
      exercises: { id: string; status: string }[];
    };
    state.exercises[0]!.status = "in-progress";
    await writeFile(join(directory, stateName), JSON.stringify(state));
    const markdownBefore = await read(directory, markdownName);
    const stateBefore = await read(directory, stateName);
    await expect(syncPersonalOnboarding(directory)).rejects.toThrow(
      /Markdown checkbox is checked; JSON status is in-progress/u,
    );
    expect(await read(directory, markdownName)).toBe(markdownBefore);
    expect(await read(directory, stateName)).toBe(stateBefore);
  });

  it("treats unchecked Markdown and in-progress JSON as different concurrent edits", async () => {
    const directory = await fixture();
    await setPersonalExerciseStatus(directory, id, "completed");
    await editMarkdown(directory, (source) =>
      source.replace("- [x] **Objective:**", "- [ ] **Objective:**"),
    );
    const state = JSON.parse(await read(directory, stateName)) as {
      exercises: { id: string; status: string }[];
    };
    state.exercises[0]!.status = "in-progress";
    await writeFile(join(directory, stateName), JSON.stringify(state));
    const markdownBefore = await read(directory, markdownName);
    const stateBefore = await read(directory, stateName);
    await expect(syncPersonalOnboarding(directory)).rejects.toThrow(
      /Markdown checkbox is unchecked; JSON status is in-progress/u,
    );
    expect(await read(directory, markdownName)).toBe(markdownBefore);
    expect(await read(directory, stateName)).toBe(stateBefore);
  });

  it.each(["missing", "duplicate"])(
    "rejects %s exercise IDs without writing",
    async (caseName) => {
      const directory = await fixture();
      await editMarkdown(directory, (source) =>
        caseName === "missing"
          ? source.replace(`<!-- tk:onboard:exercise ${id} -->`, "")
          : source.replace(
              `<!-- tk:onboard:exercise ${id} -->`,
              `<!-- tk:onboard:exercise ${id} -->\n<!-- tk:onboard:exercise ${id} -->`,
            ),
      );
      const markdownBefore = await read(directory, markdownName);
      const stateBefore = await read(directory, stateName);
      await expect(syncPersonalOnboarding(directory)).rejects.toThrow(
        /personal exercise ID/u,
      );
      expect(await read(directory, markdownName)).toBe(markdownBefore);
      expect(await read(directory, stateName)).toBe(stateBefore);
    },
  );

  it("ignores prose, is idempotent, and retains legacy progress", async () => {
    const directory = await fixture();
    const legacy =
      '{"schemaVersion":1,"tasks":[{"taskId":"legacy:one","status":"completed"}]}\n';
    await writeFile(
      join(directory, ".transferkit.local/onboarding-progress.json"),
      legacy,
    );
    await editMarkdown(directory, (source) =>
      source.replace(
        "_Add your observations._",
        "I completed my notes but have not checked the box.",
      ),
    );
    const markdownBefore = await read(directory, markdownName);
    const stateBefore = await read(directory, stateName);
    expect(await syncPersonalOnboarding(directory)).toContain(
      "already synchronized",
    );
    expect(await read(directory, markdownName)).toBe(markdownBefore);
    expect(await read(directory, stateName)).toBe(stateBefore);
    expect(
      (await readPersonalOnboardingState(directory))?.exercises[0]?.status,
    ).toBe("not-started");
    expect(
      await read(directory, ".transferkit.local/onboarding-progress.json"),
    ).toBe(legacy);
  });

  it("imports an older workspace checkbox when v2 JSON is absent", async () => {
    const directory = await fixture();
    await unlink(join(directory, stateName));
    await editMarkdown(directory, (source) =>
      source.replace("- [ ] **Objective:**", "- [x] **Objective:**"),
    );
    await syncPersonalOnboarding(directory);
    expect(
      (await readPersonalOnboardingState(directory))?.exercises[0]?.status,
    ).toBe("completed");
  });

  it("keeps personal status when the shared guide changes", async () => {
    const directory = await fixture();
    await setPersonalExerciseStatus(directory, id, "completed");
    await writeFile(
      join(directory, "ONBOARDING.md"),
      `${await read(directory, "ONBOARDING.md")}\nNew source evidence.\n`,
    );
    expect(await syncPersonalOnboarding(directory)).toContain(
      "already synchronized",
    );
    expect(
      (await readPersonalOnboardingState(directory))?.exercises[0]?.status,
    ).toBe("completed");
    expect(await read(directory, markdownName)).toContain(
      "- [x] **Objective:**",
    );
  });
});
