import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  it("renders distinct cited journeys and their related TypeORM concepts without asserting completed writes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-deep-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-deep-guide",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    const generated = await guide(directory);
    expect(generated.match(/### Source journey:/gu)).toHaveLength(2);
    expect(
      [
        "## Start here",
        "## System map",
        "## Concepts",
        "## Connected journeys",
        "## Change points",
        "## Run and observe",
        "## Specific questions",
        "## Reference appendix",
      ].map((heading) => generated.indexOf(heading)),
    ).toEqual(
      [
        ...[
          "## Start here",
          "## System map",
          "## Concepts",
          "## Connected journeys",
          "## Change points",
          "## Run and observe",
          "## Specific questions",
          "## Reference appendix",
        ].map((heading) => generated.indexOf(heading)),
      ].sort((a, b) => a - b),
    );
    expect(generated).toContain(
      "<details><summary>Inventories, candidate routes, and supporting declarations</summary>",
    );
    expect(generated).toContain('<a id="journey-ordercontroller-');
    expect(generated).toContain("### Source journey: LimitsController.check");
    expect(
      generated.match(
        /### Source journey: OrderController\.(?:preview|submit)/gu,
      ) ?? [],
    ).toHaveLength(1);
    expect(generated).toContain("Checks !input.valid");
    expect(generated).toContain("when input.priority");
    expect(generated).toContain("otherwise input.priority");
    expect(generated).toContain(
      "runner.manager.save (write-like attempt); target unresolved",
    );
    expect(generated).not.toContain("cache.save (write-like attempt)");
    expect(generated).toContain("### OrderEntity");
    expect(generated).toMatch(/\[entity\.ts:\d+\]\(entity\.ts#L\d+\)/u);
    expect(generated).toContain("### AccountEntity");
    expect(generated).toContain(
      "Declared ManyToOne relation account → AccountEntity",
    );
    expect(generated).toContain(
      "no selected journey call was linked to this entity",
    );
    expect(generated).not.toContain("save succeeded");
    await writeFile(
      join(directory, "ONBOARDING.md"),
      generated.replace("## Concepts", "## Concepts\n\nHuman concept note."),
    );
    await generateOnboardingGuide(directory);
    expect(await guide(directory)).toContain("Human concept note.");
  });

  it("inserts a new Concepts section in order when upgrading a marked guide", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-upgrade-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-deep-guide",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    const original = await guide(directory);
    const older = original.replace(
      /<!-- tk:onboard:section concepts begin -->[\s\S]*?<!-- tk:onboard:section concepts end -->\n\n/u,
      "Human note between sections.\n\n",
    );
    await writeFile(join(directory, "ONBOARDING.md"), older);
    const snapshotPath = join(
      directory,
      ".transferkit/onboarding-guide-snapshot.json",
    );
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      sections: Record<string, string>;
    };
    delete snapshot.sections.concepts;
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    await generateOnboardingGuide(directory);
    const upgraded = await guide(directory);
    expect(upgraded).toContain("Human note between sections.");
    expect(upgraded.indexOf("## Concepts")).toBeLessThan(
      upgraded.indexOf("## Connected journeys"),
    );
  });

  it("upgrades older marked section headings and retains independent human context", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    const replacements = new Map([
      ["System map", "System overview"],
      ["Connected journeys", "Explained flow"],
      ["Run and observe", "Setup and operations"],
      ["Specific questions", "Unknowns"],
    ]);
    let older = await guide(directory);
    const snapshotPath = join(
      directory,
      ".transferkit/onboarding-guide-snapshot.json",
    );
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      sections: Record<string, string>;
    };
    for (const [current, prior] of replacements) {
      older = older.replace(`## ${current}`, `## ${prior}`);
      for (const [id, body] of Object.entries(snapshot.sections))
        snapshot.sections[id] = body.replace(`## ${current}`, `## ${prior}`);
    }
    older +=
      "\n## System context\n\nOwner-written context stays here.\n\n## Verified local setup\n\nOwner verified this separately.\n";
    await writeFile(join(directory, "ONBOARDING.md"), older);
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    await generateOnboardingGuide(directory);
    const upgraded = await guide(directory);
    expect(upgraded).toContain("## Start here");
    expect(upgraded).toContain("## Run and observe");
    expect(upgraded).toContain("Owner-written context stays here.");
    expect(upgraded).toContain("Owner verified this separately.");
    expect(await generateOnboardingGuide(directory)).toContain(
      "already up to date",
    );
  });

  it("keeps an empty Nest handler as a candidate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-empty-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/realistic-nestjs",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    const generated = await guide(directory);
    expect(generated).toContain("**Candidate routes**");
    expect(generated).not.toContain("### Source journey:");
  });

  it("omits TypeORM concepts for a plain Node app", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-node-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-plain-node",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    const generated = await guide(directory);
    expect(generated).not.toContain("## Concepts");
    expect(generated).toContain(
      "health check and an in-memory parcel status lookup",
    );
    expect(generated).toContain("README.md:3");
    expect(generated).toContain("src/server.js:1");
  });

  it("links only a matching BullMQ publication to a possible worker continuation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-queue-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-phase4",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    const generated = await guide(directory);
    expect(generated).toContain("Possible continuation:");
    expect(generated).toContain("ParcelProcessor.process");
    expect(generated).toContain("Unconnected publication:");
    expect(generated).toContain("archive-parcel");
    expect(generated).toContain("These are declared handlers");
    expect(generated).toContain("ParcelJobs.inspect");
    expect(generated).toContain("calls Parcel");
    expect(generated).not.toContain("unknown on parcel-jobs");
    expect(generated).not.toContain("OtherProcessor.process is registered");
    expect(generated).toContain(
      "Source comment says: Keep the read before publication",
    );
    expect(generated).not.toContain("Project description (README statement)");
  });

  it("resolves an explicit focus and rejects unknown entries without writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-focus-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-phase4",
      ),
      directory,
      { recursive: true },
    );
    await expect(
      generateOnboardingGuide(directory, { focus: "NoController.missing" }),
    ).rejects.toThrow("did not match");
    await expect(
      readFile(join(directory, "ONBOARDING.md"), "utf8"),
    ).rejects.toThrow();
    await generateOnboardingGuide(directory, {
      focus: "ParcelController.dispatch",
    });
    expect(await guide(directory)).toContain(
      "### Source journey: ParcelController.dispatch",
    );
  });

  it("selects the same neutral journeys on repeat scans and attributes a credible README description", async () => {
    const source = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../fixtures/onboarding-phase4",
    );
    const first = await mkdtemp(join(tmpdir(), "tk-guide-stable-a-"));
    const second = await mkdtemp(join(tmpdir(), "tk-guide-stable-b-"));
    await cp(source, first, { recursive: true });
    await cp(source, second, { recursive: true });
    await writeFile(
      join(first, "README.md"),
      "# Parcel workflow\n\n## Description\n\nThis repository receives parcel dispatch requests and declares a queue worker for assignment.\n",
    );
    await writeFile(
      join(second, "README.md"),
      "# Parcel workflow\n\n## Description\n\nThis repository receives parcel dispatch requests and declares a queue worker for assignment.\n",
    );
    await generateOnboardingGuide(first);
    await generateOnboardingGuide(second);
    expect(await guide(first)).toBe(await guide(second));
    expect(await guide(first)).toContain(
      "**Project description (README statement):** This repository receives parcel dispatch requests",
    );
    expect(await guide(first)).toContain("[README.md:5](README.md#L5)");
  });

  it("shows a proposed setup order, declared health route, and exact configuration questions without running app scripts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tk-guide-setup-"));
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/onboarding-setup",
      ),
      directory,
      { recursive: true },
    );
    await generateOnboardingGuide(directory);
    const generated = await guide(directory);
    expect(generated).toContain("generic starter README command");
    expect(generated).toContain(
      "**Proposed order (inferred from declarations; do not run blindly):**",
    );
    expect(generated).toContain(
      "**Template variable names:** DATABASE_URL, PORT",
    );
    expect(generated).not.toContain("DATABASE_URL=");
    expect(generated).toContain("Possible health route:");
    expect(generated).toContain("4010");
    expect(generated).toContain("4000");
    expect(generated).toContain("Are migrations or seeds needed locally");
  });

  it("does not run a declared start script during guide generation", async () => {
    const directory = await fixture();
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        scripts: {
          start:
            "node -e \"require('node:fs').writeFileSync('ran-app', 'yes')\"",
        },
      }),
    );
    await generateOnboardingGuide(directory);
    await expect(
      readFile(join(directory, "ran-app"), "utf8"),
    ).rejects.toThrow();
  });

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
        "## Specific questions",
        "Human note.\n\n## Specific questions",
      ) + "\n## Team notes\n\nAsk the maintainer.\n";
    await writeFile(join(directory, "ONBOARDING.md"), edited);
    await generateOnboardingGuide(directory);
    expect(await guide(directory)).toBe(edited);
  });

  it("refreshes only the former generated introduction", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    const current = await guide(directory);
    const prior = current.replace(
      /^# Onboarding guide\n\n[\s\S]*?(?=<!-- tk:onboard:section )/u,
      "# Onboarding guide\n\nRepository-only guide generated from static evidence.\n\n",
    );
    await writeFile(join(directory, "ONBOARDING.md"), prior);
    await generateOnboardingGuide(directory);
    expect(await guide(directory)).toBe(current);
    const custom = current.replace(
      "Start with the system map",
      "My team starts with the system map",
    );
    await writeFile(join(directory, "ONBOARDING.md"), custom);
    await generateOnboardingGuide(directory);
    expect(await guide(directory)).toBe(custom);
  });

  it("preserves a human note when a different section changes", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    await writeFile(
      join(directory, "ONBOARDING.md"),
      (await guide(directory)).replace(
        "## Specific questions",
        "## Specific questions\n\nAsk about ownership.",
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
        "## Run and observe",
        "## Run and observe\n\nHuman run note.",
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
        "## Run and observe",
        "## Run and observe\n\nHuman setup note.",
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

  it("leaves stale snapshots and malformed markers untouched", async () => {
    const directory = await fixture();
    await generateOnboardingGuide(directory);
    const original = await guide(directory);
    const snapshotFile = join(
      directory,
      ".transferkit/onboarding-guide-snapshot.json",
    );
    const snapshot = await readFile(snapshotFile, "utf8");
    await writeFile(snapshotFile, "{invalid");
    await expect(generateOnboardingGuide(directory)).rejects.toThrow();
    expect(await guide(directory)).toBe(original);
    await writeFile(snapshotFile, snapshot);
    await writeFile(
      join(directory, "ONBOARDING.md"),
      original.replace("<!-- tk:onboard:section start-here end -->", ""),
    );
    const malformed = await guide(directory);
    await expect(generateOnboardingGuide(directory)).rejects.toThrow(
      /malformed|missing/u,
    );
    expect(await guide(directory)).toBe(malformed);
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
