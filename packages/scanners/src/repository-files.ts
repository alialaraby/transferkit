import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Finding } from "@transferkit/core";

export type RepositoryFileFinding = Finding<
  Record<string, string>,
  | "environment.template"
  | "containerization"
  | "ci.workflow"
  | "integration"
  | "database.migration"
  | "setup.command"
  | "setup.service"
  | "setup.port"
  | "setup.requirement"
  | "setup.variable"
>;

export async function discoverRepositoryFiles(
  repositoryDirectory: string,
): Promise<RepositoryFileFinding[]> {
  const findings: RepositoryFileFinding[] = [];
  findings.push(...(await discoverSetupFiles(repositoryDirectory)));
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
      const template = await optionalText(join(repositoryDirectory, name));
      template?.split(/\r?\n/u).forEach((line, index) => {
        const variable = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/u.exec(
          line,
        )?.[1];
        if (variable)
          findings.push(
            setupFinding(
              "setup.variable",
              `${name}:${variable}`,
              { name: variable },
              name,
              index + 1,
            ),
          );
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
  for (const folder of [
    "migrations",
    "src/migrations",
    "db/migrations",
    "database/migrations",
  ]) {
    for (const entry of await directoryFiles(
      join(repositoryDirectory, folder),
    )) {
      if (!/\.(?:ts|js|sql)$/iu.test(entry)) continue;
      const file = `${folder}/${entry}`;
      findings.push({
        id: `database.migration:${file}`,
        kind: "database.migration",
        data: { name: entry },
        evidence: [
          { file, line: 1, description: "Database migration file is present" },
        ],
      });
    }
  }
  return findings;
}

async function discoverSetupFiles(
  directory: string,
): Promise<RepositoryFileFinding[]> {
  const findings: RepositoryFileFinding[] = [];
  const pkg = await optionalText(join(directory, "package.json"));
  if (pkg) {
    try {
      const scripts = (JSON.parse(pkg) as Record<string, unknown>).scripts;
      if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
        for (const name of [
          "build",
          "start",
          "start:dev",
          "start:prod",
          "test",
          "test:e2e",
          ...Object.keys(scripts)
            .filter((name) => /(?:migrat|seed)/iu.test(name))
            .slice(0, 8),
        ]) {
          if (typeof (scripts as Record<string, unknown>)[name] === "string")
            findings.push(
              setupFinding(
                "setup.command",
                `script:${name}`,
                {
                  command: `npm run ${name}`,
                  purpose:
                    name === "build"
                      ? "build"
                      : /migrat/iu.test(name)
                        ? "migration"
                        : /seed/iu.test(name)
                          ? "seed"
                          : name.startsWith("test")
                            ? "test"
                            : name === "start:prod"
                              ? "compiled-start"
                              : "start",
                },
                "package.json",
                propertyLine(pkg, name),
              ),
            );
        }
      }
    } catch {
      /* The main package scanner reports malformed JSON. */
    }
  }
  const readme = await optionalText(join(directory, "README.md"));
  if (readme) {
    const genericReadme =
      /(?:nest(?:js)? (?:framework|starter)|starter repository|boilerplate)/iu.test(
        readme.slice(0, 1200),
      );
    let section = "";
    let fenced = false;
    readme.split(/\r?\n/u).forEach((line, index) => {
      const heading = /^#{1,3}\s+(.+)$/u.exec(line);
      if (heading && !fenced) section = heading[1]!.toLowerCase();
      if (/^\s*```/u.test(line)) {
        fenced = !fenced;
        return;
      }
      if (!fenced || !/(?:setup|install|run|test)/u.test(section)) return;
      const command = line.trim().replace(/^\$\s*/u, "");
      if (
        !/^npm install$/u.test(command) &&
        !/^npm run (?:build|start(?::(?:dev|prod))?|test(?::e2e)?)$/u.test(
          command,
        )
      )
        return;
      const purpose =
        command === "npm install"
          ? "install"
          : command === "npm run build"
            ? "build"
            : command === "npm run start:prod"
              ? "compiled-start"
              : command.includes("test")
                ? "test"
                : "start";
      findings.push(
        setupFinding(
          "setup.command",
          `readme:${index + 1}`,
          { command, purpose, ...(genericReadme ? { generic: "yes" } : {}) },
          "README.md",
          index + 1,
        ),
      );
    });
  }
  const composeFile = (await optionalText(
    join(directory, "docker-compose.yml"),
  ))
    ? "docker-compose.yml"
    : "docker-compose.yaml";
  const compose = await optionalText(join(directory, composeFile));
  if (compose) {
    let inServices = false;
    let service = "";
    let subsection = "";
    compose.split(/\r?\n/u).forEach((line, index) => {
      if (/^services:\s*$/u.test(line)) {
        inServices = true;
        return;
      }
      if (/^[^\s#][^:]*:/u.test(line)) {
        inServices = false;
        service = "";
      }
      if (!inServices) return;
      const match = /^ {2}([\w-]+):\s*$/u.exec(line);
      if (match) {
        service = match[1]!;
        subsection = "";
        findings.push(
          setupFinding(
            "setup.service",
            service,
            { name: service },
            composeFile,
            index + 1,
          ),
        );
        return;
      }
      if (!service) return;
      const key = /^ {4}([\w-]+):/u.exec(line);
      if (key) subsection = key[1]!;
      if (subsection === "depends_on") {
        const dependency = /^ {6}(?:-\s*)?([\w-]+)(?::\s*)?$/u.exec(line);
        if (dependency)
          findings.push(
            setupFinding(
              "setup.service",
              `${service}:depends:${dependency[1]}`,
              { name: service, dependsOn: dependency[1]! },
              composeFile,
              index + 1,
            ),
          );
      }
      if (subsection === "ports") {
        const port =
          /^\s+-\s*['"]?(?:(?:[\d.]+):)?(\d+):(\d+)['"]?\s*(?:#.*)?$/u.exec(
            line,
          );
        if (port)
          findings.push(
            setupFinding(
              "setup.port",
              `${service}:${index + 1}`,
              { service, hostPort: port[1]!, containerPort: port[2]! },
              composeFile,
              index + 1,
            ),
          );
      }
      if (subsection === "env_file") {
        const envFile =
          /^ {6}-\s*['"]?([^\s'"#]+)['"]?\s*(?:#.*)?$/u.exec(line) ??
          /^ {4}env_file:\s*['"]?([^\s'"#]+)['"]?\s*(?:#.*)?$/u.exec(line);
        const path = envFile?.[1];
        if (
          path &&
          /^(?:\.\/)?[\w.-]+(?:\/[\w.-]+)*$/u.test(path) &&
          !path.split("/").includes("..")
        )
          findings.push(
            setupFinding(
              "setup.requirement",
              `${service}:env:${path}`,
              { service, type: "envFile", path },
              composeFile,
              index + 1,
            ),
          );
      }
      if (subsection === "volumes") {
        const mount =
          /^ {6}-\s*['"]?(\.\/[\w./-]+):\/docker-entrypoint-initdb\.d\/[\w.-]+(?::(?:ro|rw))?['"]?\s*(?:#.*)?$/u.exec(
            line,
          );
        if (mount && !mount[1]!.includes(".."))
          findings.push(
            setupFinding(
              "setup.requirement",
              `${service}:init:${mount[1]}`,
              { service, type: "initMount", path: mount[1]! },
              composeFile,
              index + 1,
            ),
          );
      }
      if (subsection === "command" && /\bdist\/[^\s'"\]]+\.js\b/u.test(line))
        findings.push(
          setupFinding(
            "setup.requirement",
            `${service}:built-output`,
            { service, type: "builtOutput" },
            composeFile,
            index + 1,
          ),
        );
    });
    for (const finding of findings.filter(
      (item) =>
        item.kind === "setup.requirement" && item.data.type === "initMount",
    ))
      finding.data.present = (await committedFileExists(
        directory,
        finding.data.path!.replace(/^\.\//u, ""),
      ))
        ? "yes"
        : "no";
  }
  const lowerDockerfile = await optionalText(join(directory, "dockerfile"));
  const dockerfile =
    lowerDockerfile ?? (await optionalText(join(directory, "Dockerfile")));
  if (dockerfile && /(?:^|\n)RUN\s+npm\s+run\s+build\b/u.test(dockerfile))
    findings.push(
      setupFinding(
        "setup.requirement",
        "dockerfile:build",
        { type: "dockerBuild" },
        lowerDockerfile === undefined ? "Dockerfile" : "dockerfile",
        dockerfile
          .split(/\r?\n/u)
          .findIndex((line) => /^RUN\s+npm\s+run\s+build\b/u.test(line)) + 1,
      ),
    );
  const main = await optionalText(join(directory, "src/main.ts"));
  if (main) {
    const lines = main.split(/\r?\n/u);
    const assignment = lines.findIndex((line) =>
      /\b(?:const|let)\s+port\s*=\s*process\.env\.PORT\s*(?:\|\||\?\?)\s*\d+/u.test(
        line,
      ),
    );
    const listen = lines.findIndex((line) =>
      /\bapp\.listen\(\s*port\b/u.test(line),
    );
    if (assignment >= 0 && listen >= 0) {
      const defaultPort = /(?:\|\||\?\?)\s*(\d+)/u.exec(
        lines[assignment]!,
      )?.[1];
      if (defaultPort)
        findings.push(
          setupFinding(
            "setup.port",
            "app:default",
            { service: "app", defaultPort, variable: "PORT" },
            "src/main.ts",
            assignment + 1,
          ),
        );
    }
  }
  return findings;
}

async function optionalText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function setupFinding(
  kind: RepositoryFileFinding["kind"],
  id: string,
  data: Record<string, string>,
  file: string,
  line: number,
): RepositoryFileFinding {
  return {
    id: `${kind}:${id}`,
    kind,
    data,
    evidence: [{ file, line, description: `${kind} declaration` }],
  };
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
