import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Finding } from "@transferkit/core";

export type RepositoryFileFinding = Finding<
  Record<string, string>,
  "environment.template" | "containerization" | "ci.workflow" | "integration"
>;

export async function discoverRepositoryFiles(
  repositoryDirectory: string,
): Promise<RepositoryFileFinding[]> {
  const findings: RepositoryFileFinding[] = [];
  for (const name of await rootFiles(repositoryDirectory)) {
    if (isEnvTemplate(name)) {
      findings.push({
        id: `environment.template:${name}`,
        kind: "environment.template",
        data: { name },
        evidence: [
          {
            file: name,
            line: 1,
            description: "Committed environment template is present",
          },
        ],
      });
    }
    if (
      name === "Dockerfile" ||
      name === "docker-compose.yml" ||
      name === "docker-compose.yaml"
    ) {
      findings.push({
        id: `containerization:${name}`,
        kind: "containerization",
        data: { technology: "Docker", file: name },
        evidence: [
          {
            file: name,
            line: 1,
            description: `${name} provides Docker configuration`,
          },
        ],
      });
    }
  }

  try {
    const packageContents = await readFile(
      join(repositoryDirectory, "package.json"),
      "utf8",
    );
    const packageJson = JSON.parse(packageContents) as Record<string, unknown>;
    const dependencies = {
      ...objectStrings(packageJson.dependencies),
      ...objectStrings(packageJson.devDependencies),
    };
    for (const [dependency, service] of Object.entries(knownClientPackages)) {
      if (!(dependency in dependencies)) continue;
      findings.push({
        id: `integration.sdk:${dependency}`,
        kind: "integration",
        data: { client: dependency, service },
        evidence: [
          {
            file: "package.json",
            line: propertyLine(packageContents, dependency),
            description: `${dependency} client dependency is declared`,
          },
        ],
      });
    }
  } catch (error) {
    if (!isMissing(error) && !(error instanceof SyntaxError)) throw error;
  }

  const workflowsDirectory = join(repositoryDirectory, ".github", "workflows");
  for (const entry of await directoryFiles(workflowsDirectory)) {
    if (!/\.ya?ml$/u.test(entry)) continue;
    const file = `.github/workflows/${entry}`;
    const contents = await readFile(join(workflowsDirectory, entry), "utf8");
    const workflowName =
      yamlName(contents) ??
      basename(entry, entry.endsWith(".yaml") ? ".yaml" : ".yml");
    findings.push({
      id: `ci.workflow:${file}`,
      kind: "ci.workflow",
      data: { name: workflowName, provider: "GitHub Actions" },
      evidence: [
        { file, line: 1, description: "GitHub Actions workflow is present" },
      ],
    });
  }
  return findings;
}

async function rootFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function directoryFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isEnvTemplate(name: string): boolean {
  return (
    /^\.env(?:\.[\w-]+)?\.(?:example|sample|template)$/u.test(name) ||
    /^\.env\.(?:example|sample|template)$/u.test(name)
  );
}
function yamlName(contents: string): string | undefined {
  const match = /^name:\s*["']?([^\n"']+)["']?\s*$/mu.exec(contents);
  return match?.[1]?.trim();
}
function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function committedFileExists(
  repositoryDirectory: string,
  file: string,
): Promise<boolean> {
  try {
    return (await stat(join(repositoryDirectory, file))).isFile();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

const knownClientPackages: Record<string, string> = {
  stripe: "Stripe",
  twilio: "Twilio",
  "@sendgrid/mail": "SendGrid",
  "@aws-sdk/client-s3": "Amazon S3",
};
function objectStrings(value: unknown): Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}
function propertyLine(contents: string, name: string): number {
  const index = contents
    .split(/\r?\n/u)
    .findIndex((line) => line.includes(JSON.stringify(name)));
  return index < 0 ? 1 : index + 1;
}
