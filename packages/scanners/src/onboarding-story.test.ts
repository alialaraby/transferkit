import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { OnboardingConceptEvidence } from "@transferkit/core";
import { selectOnboardingStoryInventory } from "@transferkit/standards";

import { discoverOnboardingStoryEvidence } from "./onboarding-story.js";
import { scanOnboardingRepository } from "./index.js";

const root = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const empty: OnboardingConceptEvidence = {
  entities: [],
  repositories: [],
  methodResults: [],
  injections: [],
};

describe("cited onboarding story inventory", () => {
  it("identifies a CLI command, documented input and output without HTTP assumptions", async () => {
    const evidence = await discoverOnboardingStoryEvidence(
      join(root, "onboarding-human-cli"),
      [],
      empty,
    );
    const inventory = selectOnboardingStoryInventory(evidence);
    expect(inventory.purpose?.text).toContain("event file");
    expect(inventory.entries[0]?.name).toBe("event-count");
    expect(
      inventory.artifacts.some((claim) => claim.text.includes("event file")),
    ).toBe(true);
    expect(
      inventory.outputs.some((claim) => claim.text.includes("prints a count")),
    ).toBe(true);
    expect(inventory.entries[0]?.evidence).toContainEqual({
      file: "src/cli.js",
      line: 1,
    });
    expect(inventory.observations).toContainEqual(
      expect.objectContaining({
        text: expect.stringContaining("Documented alternate: A missing path"),
        evidence: [{ file: "README.md", line: 5 }],
      }),
    );
  });

  it("finds a documented Python entry while leaving unsupported internals unknown", async () => {
    const evidence = await discoverOnboardingStoryEvidence(
      join(root, "onboarding-human-sparse"),
      [],
      empty,
    );
    const inventory = selectOnboardingStoryInventory(evidence);
    expect(inventory.purpose?.text).toContain("compares item counts");
    expect(inventory.entries.map((claim) => claim.name)).toContain(
      "compare.py",
    );
    expect(
      inventory.outputs.some((claim) => claim.text.includes("standard output")),
    ).toBe(true);
    expect(inventory.boundaries).toEqual([]);
  });

  it("uses a plain Node service description without inventing persistent state", async () => {
    const evidence = await discoverOnboardingStoryEvidence(
      join(root, "onboarding-plain-node"),
      [],
      empty,
    );
    const inventory = selectOnboardingStoryInventory(evidence);
    expect(inventory.roles[0]?.text).toContain("service");
    expect(
      inventory.entries.some((claim) => claim.text.includes("src/server.js")),
    ).toBe(true);
    expect(
      inventory.outputs.some((claim) => claim.text.includes("health check")),
    ).toBe(true);
    expect(inventory.boundaries).toEqual([]);
  });

  it("rejects a Nest starter purpose and keeps route, schedule and entity roles bounded", async () => {
    const directory = join(root, "onboarding-phase4");
    const scanned = await scanOnboardingRepository(directory, []);
    const evidence = await discoverOnboardingStoryEvidence(
      directory,
      scanned.findings,
      scanned.concepts,
    );
    const inventory = selectOnboardingStoryInventory(evidence);
    expect(inventory.purpose).toBeUndefined();
    expect(
      inventory.rejectedDescriptions.some(
        (item) => item.reason === "generic starter text",
      ),
    ).toBe(true);
    expect(
      inventory.entries.some(
        (claim) => claim.name === "ParcelController.dispatch",
      ),
    ).toBe(true);
    expect(
      inventory.entries.some((claim) => claim.text.includes("scheduled")),
    ).toBe(true);
    expect(inventory.terms.some((term) => term.name === "Parcel")).toBe(true);
    expect(
      inventory.terms.find((term) => term.name === "Parcel")?.meaning,
    ).toBeUndefined();
  });
});
