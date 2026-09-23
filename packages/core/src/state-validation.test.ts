import { describe, expect, it } from "vitest";

import {
  containsLikelySecret,
  createProjectState,
  migrateHandoverState,
  parseHandoverState,
  parseOnboardingProgress,
  parseProjectState,
  redactLikelySecrets,
  serializeProjectState,
} from "./index.js";

describe("persisted state schemas and versions", () => {
  it("validates root project metadata", () => {
    const state = createProjectState(
      "example-service",
      new Date("2026-09-22T10:15:30.000Z"),
    );
    expect(parseProjectState(serializeProjectState(state))).toEqual(state);
    expect(() =>
      parseProjectState(
        'schemaVersion: 1\nproject:\n  name: ""\n  initializedAt: "invalid"\n',
      ),
    ).toThrow("Invalid TransferKit project metadata");
  });

  it("rejects malformed system models and knowledge entries", () => {
    expect(() => parseHandoverState("not json")).toThrow("not valid JSON");
    expect(() =>
      parseHandoverState(
        JSON.stringify({
          schemaVersion: 1,
          entities: [{ id: "x", kind: "unknown", name: "Invalid" }],
          knowledge: [],
        }),
      ),
    ).toThrow("Invalid TransferKit handover state");
    expect(() =>
      parseHandoverState(
        JSON.stringify({
          schemaVersion: 1,
          entities: [],
          knowledge: [{ entityId: "x", field: "owner", value: 42 }],
        }),
      ),
    ).toThrow("Invalid TransferKit handover state");
  });

  it("fails safely for unsupported newer and older versions", () => {
    expect(() =>
      parseHandoverState(
        JSON.stringify({ schemaVersion: 2, entities: [], knowledge: [] }),
      ),
    ).toThrow("unsupported newer schema version 2");
    expect(() =>
      parseOnboardingProgress(JSON.stringify({ schemaVersion: 0, tasks: [] })),
    ).toThrow("unsupported older schema version 0; no migration is available");
  });

  it("routes current state through an explicit migration boundary", () => {
    const state = { schemaVersion: 1, entities: [], knowledge: [] } as const;
    expect(migrateHandoverState(state)).toBe(state);
  });
});

describe("secret protection", () => {
  it.each([
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    "API_KEY=abcdefghijklmnop",
    "AKIAABCDEFGHIJKLMNOP",
    "sk_live_abcdefghijklmnop",
    "-----BEGIN PRIVATE KEY-----",
  ])("detects secret-like material", (value) => {
    expect(containsLikelySecret(value)).toBe(true);
  });

  it("does not flag a reference to secret management", () => {
    expect(
      containsLikelySecret("The API key is stored in the team vault"),
    ).toBe(false);
  });

  it("redacts secret-like material before rendering", () => {
    const redacted = redactLikelySecrets(
      "Use Bearer abcdefghijklmnop and password=supersecretvalue",
    );
    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).not.toContain("supersecretvalue");
  });
});
