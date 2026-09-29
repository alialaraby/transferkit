import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { discoverRepositoryFiles } from "./repository-files.js";

it("extracts documented commands, Compose dependencies and port mismatch evidence without values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-setup-"));
  await mkdir(join(directory, "src"));
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      scripts: { start: "node main.js", test: "jest", secret: "echo hidden" },
    }),
  );
  await writeFile(
    join(directory, "README.md"),
    "## Project setup\n```bash\n$ npm install\n```\n## Run the project\n```bash\n# development\n$ npm run start\n```\n## Run tests\n```bash\n$ npm run test\n```\n",
  );
  await writeFile(
    join(directory, "docker-compose.yml"),
    'services:\n  postgres:\n    image: postgres\n    volumes:\n      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro\n  app:\n    env_file:\n      - .env\n      - ./config/local.env\n    depends_on:\n      postgres:\n        condition: service_healthy\n    ports:\n      - \'3000:3000\'\n    command: ["node", "dist/main.js"]\n    environment:\n      PASSWORD: secret-value\n',
  );
  await writeFile(
    join(directory, "dockerfile"),
    "FROM node:20\nRUN npm run build\n",
  );
  await writeFile(
    join(directory, "src/main.ts"),
    "const port = process.env.PORT || 5000;\nawait app.listen(port);\n",
  );
  const findings = await discoverRepositoryFiles(directory);
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "setup.command",
        data: expect.objectContaining({ command: "npm install" }),
      }),
      expect.objectContaining({
        kind: "setup.command",
        data: expect.objectContaining({ command: "npm run start" }),
        evidence: [expect.objectContaining({ file: "README.md" })],
      }),
      expect.objectContaining({
        kind: "setup.service",
        data: expect.objectContaining({ dependsOn: "postgres" }),
      }),
      expect.objectContaining({
        kind: "setup.port",
        data: expect.objectContaining({ containerPort: "3000" }),
      }),
      expect.objectContaining({
        kind: "setup.port",
        data: expect.objectContaining({ defaultPort: "5000" }),
      }),
      expect.objectContaining({
        kind: "setup.requirement",
        data: expect.objectContaining({ type: "envFile", path: ".env" }),
      }),
      expect.objectContaining({
        kind: "setup.requirement",
        data: expect.objectContaining({
          type: "envFile",
          path: "./config/local.env",
        }),
      }),
      expect.objectContaining({
        kind: "setup.requirement",
        data: expect.objectContaining({
          type: "initMount",
          path: "./db/init.sql",
          present: "no",
        }),
      }),
      expect.objectContaining({
        kind: "setup.requirement",
        data: expect.objectContaining({ type: "builtOutput" }),
      }),
      expect.objectContaining({
        kind: "setup.requirement",
        data: expect.objectContaining({ type: "dockerBuild" }),
      }),
    ]),
  );
  expect(JSON.stringify(findings)).not.toContain("secret-value");
  expect(JSON.stringify(findings)).not.toContain("echo hidden");
  await mkdir(join(directory, "db"));
  await writeFile(join(directory, "db/init.sql"), "-- local fixture\n");
  expect(
    (await discoverRepositoryFiles(directory)).find(
      (item) =>
        item.kind === "setup.requirement" && item.data.type === "initMount",
    )?.data.present,
  ).toBe("yes");
});

it("does not manufacture setup procedures when documentation is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-no-setup-"));
  expect(
    (await discoverRepositoryFiles(directory)).filter((finding) =>
      finding.kind.startsWith("setup."),
    ),
  ).toEqual([]);
});

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
