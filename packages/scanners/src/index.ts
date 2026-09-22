import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { packageName as corePackageName } from "@transferkit/core";
import type { Evidence, Finding } from "@transferkit/core";

import {
  discoverRabbitMqConsumersInAst,
  type MessagingConsumerData,
} from "./rabbitmq-consumers.js";
import { createTypeScriptAst } from "./typescript-ast.js";

export { discoverRabbitMqConsumers } from "./rabbitmq-consumers.js";
export type { MessagingConsumerData } from "./rabbitmq-consumers.js";

export const packageName = "@transferkit/scanners";
export const dependencies = [corePackageName] as const;

interface TechnologyData {
  name: "Node.js" | "TypeScript" | "NestJS" | "RabbitMQ";
}

type PackageJson = Record<string, unknown>;
type Dependencies = ReadonlyMap<string, string>;

const rabbitMqPackages = ["@golevelup/nestjs-rabbitmq", "amqplib"] as const;

export class RepositoryScanError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RepositoryScanError";
  }
}

export async function detectProject(
  repositoryDirectory: string,
): Promise<Finding<TechnologyData>[]> {
  const packageJson = await loadPackageJson(repositoryDirectory);
  if (packageJson === undefined) {
    return [];
  }

  const dependencies = collectDependencies(packageJson);
  const findings: Finding<TechnologyData>[] = [
    technologyFinding(
      "technology.nodejs",
      "technology",
      "Node.js",
      packageEvidence("package.json identifies this as a Node.js package"),
    ),
  ];

  const hasTsConfig = await isFile(repositoryDirectory, "tsconfig.json");
  if (hasTsConfig || dependencies.has("typescript")) {
    const evidence = hasTsConfig
      ? fileEvidence("tsconfig.json", "TypeScript configuration is present")
      : dependencyEvidence("typescript", dependencies);
    findings.push(
      technologyFinding(
        "language.typescript",
        "language",
        "TypeScript",
        evidence,
      ),
    );
  }

  const hasNestConfig = await isFile(repositoryDirectory, "nest-cli.json");
  const nestPackage = firstDependency(dependencies, ["@nestjs/core"]);
  if (hasNestConfig || nestPackage !== undefined) {
    const evidence =
      nestPackage !== undefined
        ? dependencyEvidence(nestPackage, dependencies)
        : fileEvidence("nest-cli.json", "NestJS CLI configuration is present");
    findings.push(
      technologyFinding("framework.nestjs", "framework", "NestJS", evidence),
    );
  }

  const rabbitMqPackage = firstDependency(dependencies, rabbitMqPackages);
  if (rabbitMqPackage !== undefined) {
    findings.push(
      technologyFinding(
        "messaging.rabbitmq",
        "messaging",
        "RabbitMQ",
        dependencyEvidence(rabbitMqPackage, dependencies),
      ),
    );
  }

  return findings;
}

export async function scanRepository(
  repositoryDirectory: string,
): Promise<Finding<TechnologyData | MessagingConsumerData>[]> {
  const ast = createTypeScriptAst(repositoryDirectory);
  const [projectFindings, consumerFindings] = await Promise.all([
    detectProject(repositoryDirectory),
    Promise.resolve(discoverRabbitMqConsumersInAst(ast)),
  ]);
  return [...projectFindings, ...consumerFindings];
}

async function loadPackageJson(
  repositoryDirectory: string,
): Promise<PackageJson | undefined> {
  const file = join(repositoryDirectory, "package.json");
  let contents: string;

  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw new RepositoryScanError(
      `Could not read package.json: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }

  try {
    const parsed: unknown = JSON.parse(contents);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("expected a JSON object");
    }
    return parsed as PackageJson;
  } catch (error) {
    throw new RepositoryScanError(
      `Malformed package.json: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}

function collectDependencies(packageJson: PackageJson): Dependencies {
  const dependencies = new Map<string, string>();

  for (const sectionName of ["dependencies", "devDependencies"] as const) {
    const section = packageJson[sectionName];
    if (section === undefined) {
      continue;
    }
    if (
      typeof section !== "object" ||
      section === null ||
      Array.isArray(section)
    ) {
      throw new RepositoryScanError(
        `Malformed package.json: ${sectionName} must be an object`,
      );
    }

    for (const [name, version] of Object.entries(section)) {
      if (typeof version === "string") {
        dependencies.set(name, version);
      }
    }
  }

  return dependencies;
}

async function isFile(
  repositoryDirectory: string,
  relativePath: string,
): Promise<boolean> {
  try {
    return (await stat(join(repositoryDirectory, relativePath))).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw new RepositoryScanError(
      `Could not inspect ${relativePath}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

function technologyFinding(
  id: string,
  kind: string,
  name: TechnologyData["name"],
  evidence: Evidence,
): Finding<TechnologyData> {
  return { id, kind, data: { name }, evidence: [evidence] };
}

function packageEvidence(description: string): Evidence {
  return fileEvidence("package.json", description);
}

function dependencyEvidence(
  name: string,
  dependencies: Dependencies,
): Evidence {
  return packageEvidence(
    `Dependency ${name}@${dependencies.get(name) ?? "unknown"} is declared`,
  );
}

function fileEvidence(file: string, description: string): Evidence {
  return { file, description };
}

function firstDependency(
  dependencies: Dependencies,
  names: readonly string[],
): string | undefined {
  return names.find((name) => dependencies.has(name));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
