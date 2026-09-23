import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { scanRepository } from "@transferkit/scanners";

const repository = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("privacy safeguards", () => {
  it("keeps personal state Git-ignored", async () => {
    const gitignore = await readFile(join(repository, ".gitignore"), "utf8");
    expect(gitignore.split(/\r?\n/u)).toContain(".transferkit.local/");
  });

  it("records environment variable names without source values", async () => {
    const fixture = join(repository, "fixtures/milestone-four");
    const findings = await scanRepository(fixture);
    const environment = findings.filter(
      ({ kind }) => kind === "environment.variable",
    );
    expect(environment).not.toHaveLength(0);
    expect(
      environment.every(({ data }) => Object.keys(data).join() === "name"),
    ).toBe(true);
  });
});
