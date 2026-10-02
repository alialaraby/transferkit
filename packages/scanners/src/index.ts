import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { packageName as corePackageName } from "@transferkit/core";
import type {
  Evidence,
  Finding,
  OnboardingConceptEvidence,
  OnboardingQueueEvidence,
  OnboardingScheduledCall,
  OnboardingTrace,
} from "@transferkit/core";

import {
  discoverRabbitMqConsumersInAst,
  type MessagingConsumerFinding,
} from "./rabbitmq-consumers.js";
import {
  discoverHandoverContextInAst,
  type HandoverContextFinding,
} from "./handover-context.js";
import { createTypeScriptAst, type TypeScriptAst } from "./typescript-ast.js";
import {
  analyzeOnboardingRoutes,
  type OnboardingTraceLimits,
} from "./onboarding-trace.js";
import { discoverOnboardingConceptsInAst } from "./onboarding-concepts.js";
import { discoverOnboardingQueuesInAst } from "./onboarding-queues.js";
import { discoverOnboardingScheduledCallsInAst } from "./onboarding-scheduled.js";
import {
  discoverRouteTracesInAst,
  type RouteTraceFinding,
} from "./route-traces.js";
import {
  discoverScheduledJobsInAst,
  type ScheduledJobFinding,
} from "./scheduled-jobs.js";
import {
  discoverSourceFeaturesInAst,
  type SourceDiscoveryFinding,
} from "./source-discovery.js";
import {
  discoverRepositoryFiles,
  type RepositoryFileFinding,
} from "./repository-files.js";

export { discoverRabbitMqConsumers } from "./rabbitmq-consumers.js";
export { buildRabbitMqMessagingModel } from "./messaging-model.js";
export { discoverScheduledJobs, buildScheduledJobs } from "./scheduled-jobs.js";
export { discoverSourceFeatures } from "./source-discovery.js";
export { discoverHandoverContext } from "./handover-context.js";
export type { RouteTraceFinding } from "./route-traces.js";
export type { HandoverContextFinding } from "./handover-context.js";
export { discoverRepositoryFiles } from "./repository-files.js";
export { discoverOnboardingRepositoryNotes } from "./onboarding-repository-notes.js";
export { discoverOnboardingStoryEvidence } from "./onboarding-story.js";
export type {
  MessagingConsumerData,
  MessagingConsumerFinding,
} from "./rabbitmq-consumers.js";
export type {
  ScheduledJobData,
  ScheduledJobFinding,
} from "./scheduled-jobs.js";
export type { SourceDiscoveryFinding } from "./source-discovery.js";
export type { RepositoryFileFinding } from "./repository-files.js";

export type RepositoryFinding =
  | TechnologyFinding
  | MessagingConsumerFinding
  | ScheduledJobFinding
  | SourceDiscoveryFinding
  | RepositoryFileFinding
  | HandoverContextFinding
  | RouteTraceFinding;

export const packageName = "@transferkit/scanners";
export const dependencies = [corePackageName] as const;

export interface TechnologyData {
  name:
    "Node.js" | "TypeScript" | "NestJS" | "RabbitMQ" | "PostgreSQL" | "TypeORM";
}

export type TechnologyFindingKind =
  "technology" | "language" | "framework" | "messaging" | "database" | "orm";

export type TechnologyFinding = Finding<TechnologyData, TechnologyFindingKind>;

type PackageJson = Record<string, unknown>;
interface DependencyDeclaration {
  version: string;
  line?: number;
}

type Dependencies = ReadonlyMap<string, DependencyDeclaration>;

const rabbitMqPackages = ["@golevelup/nestjs-rabbitmq", "amqplib"] as const;

export class RepositoryScanError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RepositoryScanError";
  }
}

export async function detectProject(
  repositoryDirectory: string,
): Promise<TechnologyFinding[]> {
  const loadedPackageJson = await loadPackageJson(repositoryDirectory);
  if (loadedPackageJson === undefined) {
    return [];
  }

  const dependencies = collectDependencies(
    loadedPackageJson.value,
    loadedPackageJson.contents,
  );
  const findings: TechnologyFinding[] = [
    technologyFinding("technology.nodejs", "technology", "Node.js", [
      packageEvidence("package.json identifies this as a Node.js package", 1),
    ]),
  ];

  const hasTsConfig = await isFile(repositoryDirectory, "tsconfig.json");
  if (hasTsConfig || dependencies.has("typescript")) {
    const evidence: Evidence[] = [];
    if (hasTsConfig) {
      evidence.push(
        fileEvidence("tsconfig.json", "TypeScript configuration is present", 1),
      );
    }
    if (dependencies.has("typescript")) {
      evidence.push(dependencyEvidence("typescript", dependencies));
    }
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
    const evidence: Evidence[] = [];
    if (nestPackage !== undefined) {
      evidence.push(dependencyEvidence(nestPackage, dependencies));
    }
    if (hasNestConfig) {
      evidence.push(
        fileEvidence("nest-cli.json", "NestJS CLI configuration is present", 1),
      );
    }
    findings.push(
      technologyFinding("framework.nestjs", "framework", "NestJS", evidence),
    );
  }

  const rabbitMqPackage = firstDependency(dependencies, rabbitMqPackages);
  if (rabbitMqPackage !== undefined) {
    findings.push(
      technologyFinding("messaging.rabbitmq", "messaging", "RabbitMQ", [
        dependencyEvidence(rabbitMqPackage, dependencies),
      ]),
    );
  }

  const typeOrmPackage = firstDependency(dependencies, [
    "typeorm",
    "@nestjs/typeorm",
  ]);
  if (typeOrmPackage !== undefined) {
    findings.push(
      technologyFinding("orm.typeorm", "orm", "TypeORM", [
        dependencyEvidence(typeOrmPackage, dependencies),
      ]),
    );
  }
  const postgresPackage = firstDependency(dependencies, ["pg"]);
  if (postgresPackage !== undefined) {
    findings.push(
      technologyFinding("database.postgresql", "database", "PostgreSQL", [
        dependencyEvidence(postgresPackage, dependencies),
      ]),
    );
  }

  return findings;
}

export async function scanRepository(
  repositoryDirectory: string,
): Promise<RepositoryFinding[]> {
  const ast = createTypeScriptAst(repositoryDirectory);
  const { findings } = await scanRepositoryInAst(ast);
  return findings;
}

export async function scanOnboardingRepository(
  repositoryDirectory: string,
  selectedEntries:
    | readonly string[]
    | ((
        findings: readonly RepositoryFinding[],
        context: {
          queues: OnboardingQueueEvidence;
          scheduledCalls: readonly OnboardingScheduledCall[];
          concepts: OnboardingConceptEvidence;
        },
      ) => readonly string[] | Promise<readonly string[]>),
  limits: Partial<OnboardingTraceLimits> = {},
): Promise<{
  findings: RepositoryFinding[];
  traces: OnboardingTrace[];
  concepts: OnboardingConceptEvidence;
  queues: OnboardingQueueEvidence;
  scheduledCalls: OnboardingScheduledCall[];
  loadedFiles: number;
}> {
  const ast = createTypeScriptAst(repositoryDirectory);
  const { findings, contextFindings } = await scanRepositoryInAst(ast);
  const queues = discoverOnboardingQueuesInAst(ast);
  const scheduledCalls = discoverOnboardingScheduledCallsInAst(ast, findings);
  const concepts = discoverOnboardingConceptsInAst(ast);
  const entries =
    typeof selectedEntries === "function"
      ? await selectedEntries(findings, { queues, scheduledCalls, concepts })
      : selectedEntries;
  const selected = contextFindings.filter(
    (route) =>
      route.kind === "application.route" &&
      entries.includes(`${route.data.controller}.${route.data.method}`),
  );
  for (const job of findings.filter((item) => item.kind === "scheduled-job")) {
    const data = job.data as unknown as Record<string, unknown>;
    const name = data.name;
    if (typeof name !== "string" || !entries.includes(name)) continue;
    const [controller, method] = name.split(".");
    if (!controller || !method) continue;
    selected.push({
      id: `onboarding-entry:${job.id}`,
      kind: "application.route",
      data: {
        controller,
        method,
        entryKind: "scheduled",
        ...(typeof data.schedule === "string" ||
        typeof data.schedule === "number"
          ? { schedule: String(data.schedule) }
          : {}),
      },
      evidence: job.evidence,
    });
  }
  return {
    findings,
    traces: analyzeOnboardingRoutes(ast, selected, {
      maxEntries: entries.length,
      ...limits,
    }),
    concepts,
    queues,
    scheduledCalls,
    loadedFiles: ast.sourceFiles.length,
  };
}

async function scanRepositoryInAst(ast: TypeScriptAst): Promise<{
  findings: RepositoryFinding[];
  contextFindings: HandoverContextFinding[];
}> {
  const { repositoryDirectory } = ast;
  const [projectFindings, fileFindings] = await Promise.all([
    detectProject(repositoryDirectory),
    discoverRepositoryFiles(repositoryDirectory),
  ]);
  const contextFindings = discoverHandoverContextInAst(ast);
  return {
    contextFindings,
    findings: [
      ...projectFindings,
      ...discoverRabbitMqConsumersInAst(ast),
      ...discoverScheduledJobsInAst(ast),
      ...discoverSourceFeaturesInAst(ast),
      ...contextFindings,
      ...discoverRouteTracesInAst(ast, contextFindings),
      ...fileFindings,
    ],
  };
}

async function loadPackageJson(
  repositoryDirectory: string,
): Promise<{ value: PackageJson; contents: string } | undefined> {
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
    return { value: parsed as PackageJson, contents };
  } catch (error) {
    throw new RepositoryScanError(
      `Malformed package.json: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}

function collectDependencies(
  packageJson: PackageJson,
  contents: string,
): Dependencies {
  const dependencies = new Map<string, DependencyDeclaration>();

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
        const line = propertyLine(contents, name, version);
        dependencies.set(name, {
          version,
          ...(line === undefined ? {} : { line }),
        });
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
  kind: TechnologyFindingKind,
  name: TechnologyData["name"],
  evidence: Evidence[],
): TechnologyFinding {
  return { id, kind, data: { name }, evidence };
}

function packageEvidence(description: string, line?: number): Evidence {
  return fileEvidence("package.json", description, line);
}

function dependencyEvidence(
  name: string,
  dependencies: Dependencies,
): Evidence {
  const declaration = dependencies.get(name);
  return packageEvidence(
    `Dependency ${name}@${declaration?.version ?? "unknown"} is declared`,
    declaration?.line,
  );
}

function fileEvidence(
  file: string,
  description: string,
  line?: number,
): Evidence {
  return { file, ...(line === undefined ? {} : { line }), description };
}

function propertyLine(
  contents: string,
  propertyName: string,
  propertyValue: string,
): number | undefined {
  const propertyPrefix = `${JSON.stringify(propertyName)}:`;
  const serializedValue = JSON.stringify(propertyValue);
  const lines = contents.split(/\r?\n/u);
  const index = lines.findIndex(
    (line) =>
      line.trimStart().startsWith(propertyPrefix) &&
      line.includes(serializedValue),
  );
  return index === -1 ? undefined : index + 1;
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
