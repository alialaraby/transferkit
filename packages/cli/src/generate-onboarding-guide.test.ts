import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateOnboardingGuide } from "./generate-onboarding-guide.js";

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tk-guide-sync-"));
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ scripts: { start: "node app.js" } }),
  );
  return directory;
}

async function guide(directory: string): Promise<string> {
  return readFile(join(directory, "ONBOARDING.md"), "utf8");
}

describe("shared guide regeneration", () => {
  it("updates unchanged generated sections and is idempotent", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    const snapshotFile = join(
      directory,
      ".transferkit/onboarding-guide-snapshot.json",
    );
    const original = await guide(directory);
    const snapshot = await readFile(snapshotFile, "utf8");
    expect(await generateOnboardingGuide(directory)).toContain(
      "already up to date",
    );
    expect(await guide(directory)).toBe(original);
    expect(await readFile(snapshotFile, "utf8")).toBe(snapshot);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ scripts: { start: "node app.js", test: "vitest" } }),
    );
    expect(await generateOnboardingGuide(directory)).toContain("Regenerated");
    expect(await guide(directory)).toContain("npm run test");
    expect(await generateOnboardingGuide(directory)).toContain(
      "already up to date",
    );
  });

  it("preserves notes within unchanged sections and unknown sections", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    const edited =
      (await guide(directory)).replace(
        "## Unknowns",
        "Human note.\n\n## Unknowns",
      ) + "\n## Team notes\n\nAsk the maintainer.\n";
    await writeFile(join(directory, "ONBOARDING.md"), edited);
    await generateOnboardingGuide(directory);
    expect(await guide(directory)).toBe(edited);
  });

  it("preserves a human note when a different section changes", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    await writeFile(
      join(directory, "ONBOARDING.md"),
      (await guide(directory)).replace(
        "## Unknowns",
        "## Unknowns\n\nAsk about ownership.",
      ),
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ scripts: { start: "node app.js", test: "vitest" } }),
    );
    await generateOnboardingGuide(directory);
    expect(await guide(directory)).toContain("Ask about ownership.");
    expect(await guide(directory)).toContain("npm run test");
  });

  it("retains human content and reports a conflict when a finding disappears", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    await writeFile(
      join(directory, "ONBOARDING.md"),
      (await guide(directory)).replace(
        "## Setup and operations",
        "## Setup and operations\n\nHuman run note.",
      ),
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ scripts: {} }),
    );
    const before = await guide(directory);
    await expect(generateOnboardingGuide(directory)).rejects.toThrow(
      /Human run note\.[\s\S]*Newly generated/u,
    );
    expect(await guide(directory)).toBe(before);
  });

  it("reports both versions and leaves files untouched on a same-section conflict", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    await writeFile(
      join(directory, "ONBOARDING.md"),
      (await guide(directory)).replace(
        "## Setup and operations",
        "## Setup and operations\n\nHuman setup note.",
      ),
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ scripts: { start: "node app.js", test: "vitest" } }),
    );
    const before = await guide(directory);
    const snapshotFile = join(
      directory,
      ".transferkit/onboarding-guide-snapshot.json",
    );
    const snapshot = await readFile(snapshotFile, "utf8");
    await expect(generateOnboardingGuide(directory)).rejects.toThrow(
      /Human setup note\.[\s\S]*npm run test/u,
    );
    expect(await guide(directory)).toBe(before);
    expect(await readFile(snapshotFile, "utf8")).toBe(snapshot);
  });

  it("leaves an unmarked guide untouched and gives a next step", async () => {
    const directory = await fixture();
    await writeFile(join(directory, "ONBOARDING.md"), "# Human guide\n");
    await expect(generateOnboardingGuide(directory)).rejects.toThrow(
      /Move it aside/u,
    );
    expect(await guide(directory)).toBe("# Human guide\n");
  });

  it("does not restore a managed section deleted by a person", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    const original = await guide(directory);
    const edited = original.replace(
      /<!-- tk:onboard:section setup-and-operations begin -->[\s\S]*?<!-- tk:onboard:section setup-and-operations end -->/u,
      "",
    );
    await writeFile(join(directory, "ONBOARDING.md"), edited);
    await expect(generateOnboardingGuide(directory)).rejects.toThrow(
      /Managed section setup-and-operations is missing/u,
    );
    expect(await guide(directory)).toBe(edited);
  });
});
