import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { OnboardingConceptEvidence } from "@transferkit/core";

import { discoverOnboardingStoryEvidence } from "./onboarding-story.js";
import { scanOnboardingRepository } from "./index.js";

const root = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const empty: OnboardingConceptEvidence = {
  entities: [],
  repositories: [],
  methodResults: [],
  injections: [],
};

describe("cited onboarding story evidence", () => {
  it("identifies a CLI command, documented input and output without HTTP assumptions", async () => {
    const evidence = await discoverOnboardingStoryEvidence(
      join(root, "onboarding-human-cli"),
      [],
      empty,
    );
    const claims = evidence.claims;
    expect(claims.find((claim) => claim.kind === "purpose")?.text).toContain(
      "event file",
    );
    expect(claims.find((claim) => claim.kind === "entry")?.name).toBe(
      "event-count",
    );
    expect(
      claims.some(
        (claim) =>
          claim.kind === "artifact" && claim.text.includes("event file"),
      ),
    ).toBe(true);
    expect(
      claims.some(
        (claim) =>
          claim.kind === "output" && claim.text.includes("prints a count"),
      ),
    ).toBe(true);
    expect(
      claims.find((claim) => claim.kind === "entry")?.evidence,
    ).toContainEqual({
      file: "src/cli.js",
      line: 1,
    });
    expect(
      claims.filter((claim) => claim.kind === "observation"),
    ).toContainEqual(
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
    expect(
      evidence.claims.find((claim) => claim.kind === "purpose")?.text,
    ).toContain("compares item counts");
    expect(
      evidence.claims
        .filter((claim) => claim.kind === "entry")
        .map((claim) => claim.name),
    ).toContain("compare.py");
    expect(
      evidence.claims.some(
        (claim) =>
          claim.kind === "output" && claim.text.includes("standard output"),
      ),
    ).toBe(true);
    expect(
      evidence.claims.filter((claim) => claim.kind === "boundary"),
    ).toEqual([]);
  });

  it("uses a plain Node service description without inventing persistent state", async () => {
    const evidence = await discoverOnboardingStoryEvidence(
      join(root, "onboarding-plain-node"),
      [],
      empty,
    );
    expect(
      evidence.claims.find((claim) => claim.kind === "role")?.text,
    ).toContain("service");
    expect(
      evidence.claims.some(
        (claim) =>
          claim.kind === "entry" && claim.text.includes("src/server.js"),
      ),
    ).toBe(true);
    expect(
      evidence.claims.some(
        (claim) =>
          claim.kind === "output" && claim.text.includes("health check"),
      ),
    ).toBe(true);
    expect(
      evidence.claims.filter((claim) => claim.kind === "boundary"),
    ).toEqual([]);
  });

  it("rejects a Nest starter purpose and keeps route, schedule and entity roles bounded", async () => {
    const directory = join(root, "onboarding-phase4");
    const scanned = await scanOnboardingRepository(directory, []);
    const evidence = await discoverOnboardingStoryEvidence(
      directory,
      scanned.findings,
      scanned.concepts,
    );
    expect(evidence.claims.some((claim) => claim.kind === "purpose")).toBe(
      false,
    );
    expect(
      evidence.rejectedDescriptions.some(
        (item) => item.reason === "generic starter text",
      ),
    ).toBe(true);
    expect(
      evidence.claims.some(
        (claim) =>
          claim.kind === "entry" && claim.name === "ParcelController.dispatch",
      ),
    ).toBe(true);
    expect(
      evidence.claims.some(
        (claim) => claim.kind === "entry" && claim.text.includes("scheduled"),
      ),
    ).toBe(true);
    expect(evidence.terms.some((term) => term.name === "Parcel")).toBe(true);
    expect(
      evidence.terms.find((term) => term.name === "Parcel")?.meaning,
    ).toBeUndefined();
  });
});
