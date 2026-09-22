import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { initializeHandover } from "./initialize-handover.js";

describe("initializeHandover", () => {
  it("creates initial shared project state from package metadata", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "transferkit-init-"));
    await writeFile(
      join(projectDirectory, "package.json"),
      JSON.stringify({ name: "example-service" }),
    );

    const result = await initializeHandover(
      projectDirectory,
      new Date("2026-09-22T10:15:30.000Z"),
    );

    expect(result.status).toBe("initialized");
    await expect(readFile(result.projectFile, "utf8")).resolves.toBe(
      'schemaVersion: 1\n\nproject:\n  name: "example-service"\n  initializedAt: "2026-09-22T10:15:30.000Z"\n',
    );
  });

  it("leaves existing project state unchanged", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "transferkit-init-"));
    const first = await initializeHandover(
      projectDirectory,
      new Date("2026-09-22T10:15:30.000Z"),
    );
    const originalContents = await readFile(first.projectFile, "utf8");

    const second = await initializeHandover(
      projectDirectory,
      new Date("2027-01-01T00:00:00.000Z"),
    );

    expect(second.status).toBe("already-initialized");
    await expect(readFile(second.projectFile, "utf8")).resolves.toBe(
      originalContents,
    );
  });
});
