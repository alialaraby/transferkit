import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { discoverRepositoryFiles } from "./repository-files.js";

it("discovers source-backed migration and runtime configuration files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-migrations-"));
  await mkdir(join(directory, "src/migrations"), { recursive: true });
  await writeFile(
    join(directory, "src/migrations/001-create-users.sql"),
    "CREATE TABLE users (id int);\n",
  );
  await writeFile(join(directory, ".env.example"), "DB_HOST=localhost\n");
  const findings = await discoverRepositoryFiles(directory);
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "database.migration",
        evidence: [
          expect.objectContaining({
            file: "src/migrations/001-create-users.sql",
          }),
        ],
      }),
      expect.objectContaining({
        kind: "environment.template",
        evidence: [expect.objectContaining({ file: ".env.example" })],
      }),
    ]),
  );
});
