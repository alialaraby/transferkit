import type {
  CandidateFlow,
  ComponentRelationship,
  Evidence,
  ExplainedFlow,
  Finding,
  ProjectModel,
  RouteTrace,
} from "@transferkit/core";
import { sanitizeHandoverValue } from "./handover-package.js";

const genericIntegrations = new Set([
  "axios",
  "fetch",
  "http",
  "http client",
  "httpservice",
  "nestjs httpservice",
  "unknown http integration",
]);

export function renderOnboardingGuide(
  model: ProjectModel,
  findings: readonly Finding[],
  explanations: readonly ExplainedFlow[] = [],
): string {
  const named = (kind: string): Finding[] =>
    findings.filter((finding) => finding.kind === kind);
  const data = (finding: Finding, key: string): string | undefined => {
    const value = finding.data;
    if (typeof value !== "object" || value === null || !(key in value))
      return undefined;
    const field = (value as Record<string, unknown>)[key];
    return typeof field === "string" && field.trim() ? field : undefined;
  };
  const names = (kind: string, key = "name"): string[] =>
    unique(named(kind).flatMap((finding) => data(finding, key) ?? []));
  const integrations = [
    ...new Map(
      model.components
        .filter((component) => component.kind === "INTEGRATION")
        .map((component) => component.name)
        .filter((name) => !genericIntegrations.has(name.toLowerCase()))
        .map((name) => [name.toLowerCase(), name]),
    ).values(),
  ];
  const components = new Map(
    model.components.map((component) => [component.id, component]),
  );
  const flows = selectFlows(model.candidateFlows, model, findings);
  const eligible = flows.flatMap((flow) =>
    explanations.filter((item) =>
      flow.sourceFindingIds.includes(item.routeFindingId),
    ),
  );
  const first = eligible[0];
  const firstStart = flows.find((flow) =>
    flow.sourceFindingIds.includes(first?.routeFindingId ?? ""),
  )?.componentIds[0];
  const complementary =
    eligible
      .slice(1)
      .find(
        (item) =>
          item.title !== first?.title &&
          flows.some(
            (flow) =>
              flow.sourceFindingIds.includes(item.routeFindingId) &&
              flow.componentIds[0] === firstStart,
          ),
      ) ?? eligible.slice(1).find((item) => item.title !== first?.title);
  const explained = first
    ? [first, ...(complementary ? [complementary] : [])]
    : [];
  const preferredComponents = new Set([
    ...flows.flatMap((flow) => flow.componentIds),
    ...model.domains
      .filter(
        (domain) =>
          domain.name !== "Module" &&
          flows.some((flow) =>
            domain.controllers.includes(flow.componentIds[0] ?? ""),
          ),
      )
      .flatMap((domain) => domain.modules),
  ]);
  const modules = model.components.filter((item) => item.kind === "MODULE");
  const rootModules = modules.filter((item) => /^appmodule$/iu.test(item.name));
  const supportModules = modules.filter(
    (item) =>
      !rootModules.includes(item) &&
      /^(?:auth|audit|config|data|database|device|exception|health|rate|shared|common|monitoring|metrics)/iu.test(
        item.name,
      ),
  );
  const featureModules = modules.filter(
    (item) => !rootModules.includes(item) && !supportModules.includes(item),
  );
  const overviewEvidence = [
    ...named("application.entry-point"),
    ...named("framework"),
    ...named("language"),
    ...named("application.module"),
    ...named("database"),
    ...named("database.configuration"),
  ].flatMap((item) => item.evidence);
  const entryFiles = unique(
    named("application.entry-point").flatMap((item) =>
      item.evidence.map((e) => e.file),
    ),
  );
  const rootImports = unique(
    named("application.module")
      .filter((item) =>
        rootModules.some((module) => module.name === data(item, "name")),
      )
      .flatMap((item) =>
        (data(item, "importNames") ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      ),
  );
  const lines = [
    "# Onboarding guide",
    "",
    "Repository-only guide generated from static evidence.",
    "",
    "## System overview",
    "",
    ...fact(
      "Observed in code",
      `Bootstrap file: ${entryFiles.join(", ")}; creates ${unique(names("application.entry-point", "module")).join(", ")}`,
      entryFiles.length > 0,
    ),
    ...fact(
      "Observed in repository",
      `Technology signals: ${unique([...names("framework"), ...names("language")]).join(", ")}`,
      names("framework").length + names("language").length > 0,
    ),
    ...fact(
      "Observed in code",
      `Root module: ${rootModules.map((item) => item.name).join(", ")}`,
      rootModules.length > 0,
    ),
    ...fact(
      "Observed in code",
      `Root module imports: ${rootImports.join(", ")}`,
      rootImports.length > 0,
    ),
    ...fact(
      "Inferred",
      `Other discovered feature/API modules by name: ${unique(
        featureModules
          .filter((item) => !rootImports.includes(item.name))
          .map((item) => item.name),
      )
        .sort()
        .join(", ")}`,
      featureModules.some((item) => !rootImports.includes(item.name)),
    ),
    ...fact(
      "Inferred",
      `Other discovered support/integration modules by name: ${unique(
        supportModules
          .filter((item) => !rootImports.includes(item.name))
          .map((item) => item.name),
      )
        .sort()
        .join(", ")}`,
      supportModules.some((item) => !rootImports.includes(item.name)),
    ),
    ...fact(
      "Observed in repository",
      `Data-store signals: ${names("database").join(", ")}`,
      names("database").length > 0,
    ),
    ...fact(
      "Inferred",
      `Named external integrations to investigate: ${integrations.sort().join(", ")}`,
      integrations.length > 0,
    ),
    ...fact(
      "Observed in code",
      `Scheduled handlers: ${names("scheduled-job").sort().join(", ")}`,
      names("scheduled-job").length > 0,
    ),
  ];
  if (lines.at(-1) === "")
    lines.push(
      "No system components were identified from supported static evidence.",
    );
  lines.push(
    "",
    "Repository inspection is static; production behavior is unverified.",
    ...details(overviewEvidence),
    ...(named("scheduled-job").length || integrations.length
      ? ["", "<details><summary>Job and integration references</summary>", ""]
      : []),
    ...named("scheduled-job").flatMap((item) =>
      item.evidence.length
        ? [
            `- Scheduled handler ${safe(data(item, "name") ?? "unknown")}: ${reference(item.evidence[0]!)}`,
          ]
        : [],
    ),
    ...integrations.flatMap((name) => {
      const item = model.components.find(
        (component) =>
          component.kind === "INTEGRATION" &&
          component.name === name &&
          component.evidence.length,
      );
      return item
        ? [
            `- Integration signal ${safe(name)}: ${reference(item.evidence[0]!)}`,
          ]
        : [];
    }),
    ...(named("scheduled-job").length || integrations.length
      ? ["", "</details>"]
      : []),
    "",
    "## Architecture relationships",
    "",
  );
  const relationshipCandidates = model.relationships
    .filter((relation) => relation.evidence.length > 0)
    .filter((relation) =>
      [
        "MODULE_IMPORT",
        "MODULE_CONTROLLER",
        "CONTROLLER_SERVICE",
        "SERVICE_ENTITY",
        "SERVICE_INTEGRATION",
        "JOB_SERVICE",
      ].includes(relation.kind),
    )
    .filter((relation) => {
      const target = components.get(relation.to);
      return (
        target?.kind !== "INTEGRATION" || integrations.includes(target.name)
      );
    });
  const relationships = selectRelationships(
    relationshipCandidates,
    components,
    preferredComponents,
  );
  if (relationships.length === 0)
    lines.push("No supported component relationships were found.");
  else
    lines.push(
      "These declarations indicate associations; runtime calls are unverified.",
      "",
    );
  for (const relation of relationships) {
    const from = components.get(relation.from)?.name;
    const to = components.get(relation.to)?.name;
    if (from && to)
      lines.push(
        `- **Inferred from declarations:** ${safe(from)} → ${safe(to)} (${relation.kind.toLowerCase().replace(/_/gu, " ")}).`,
      );
  }
  lines.push(...details(relationships.flatMap((item) => item.evidence)), "");
  if (explained.length)
    lines.push(
      "## Explained flow",
      "",
      "These are partial static method-body traces. Runtime outcomes are unverified.",
      "",
      ...explained.flatMap((flow) => [
        `### ${safe(flow.title)}`,
        "",
        `**Observed in code:** ${safe(flow.entryPoint)}.`,
        "",
        ...flow.steps.map(
          (step, index) =>
            `${index + 1}. ${safe(step.text)} [Step ${index + 1}]`,
        ),
        "",
        "**Gaps:**",
        "",
        ...flow.gaps.map((gap) => `- ${safe(gap)}`),
        "",
        ...explainedDetails(
          flow,
          findings.find(
            (item) =>
              item.kind === "application.route" &&
              item.id === flow.routeFindingId,
          )?.evidence ?? [],
        ),
        "",
      ]),
    );
  lines.push("## Candidate flows", "");
  const remainingFlows = flows.filter(
    (flow) =>
      !explained.some((item) =>
        flow.sourceFindingIds.includes(item.routeFindingId),
      ),
  );
  if (remainingFlows.length)
    lines.push(
      "Investigation starting points selected from route names and linked evidence. Method calls, decisions, persistence order, and runtime outcomes are unverified.",
      "",
    );
  if (remainingFlows.length === 0)
    lines.push(
      explained.length
        ? "No other supported route candidate was found."
        : "No supported route candidate was found.",
    );
  for (const flow of remainingFlows) {
    const start = components.get(flow.componentIds[0] ?? "")?.name;
    const route = findings.find(
      (item) =>
        item.kind === "application.route" &&
        flow.sourceFindingIds.includes(item.id),
    );
    const trace = findings.find(
      (item) =>
        item.kind === "application.route-trace" &&
        typeof item.data === "object" &&
        item.data !== null &&
        "routeFindingId" in item.data &&
        flow.sourceFindingIds.includes(
          (item.data as Record<string, unknown>).routeFindingId as string,
        ),
    );
    lines.push(
      `### ${safe(flow.title)}`,
      "",
      `- **Inferred candidate:** ${safe(flow.entryPoints.join(", ") || "Entry point unknown")}.`,
      `- **Observed starting component:** ${safe(start ?? "not identified")}. ${trace ? `Direct service method: ${safe(data(trace, "serviceMethod") ?? "unresolved")}.` : "Direct service method unresolved by the current trace."}`,
      ...details([...(route?.evidence ?? []), ...(trace?.evidence ?? [])]),
      "",
    );
  }
  lines.push(
    "## Setup and operations",
    "",
    "Repository documentation and configuration only; no procedure has been run.",
    "",
  );
  const setupCommands = named("setup.command");
  for (const purpose of ["install", "start", "compiled-start", "test"]) {
    const commands = setupCommands.filter(
      (item) => data(item, "purpose") === purpose,
    );
    const preferred =
      commands.find((item) => item.evidence[0]?.file === "README.md") ??
      commands[0];
    if (preferred)
      lines.push(
        `- **Documented, runtime unverified — ${purpose}:** \`${safe(data(preferred, "command") ?? "")}\` (${safe(preferred.evidence[0]?.file ?? "repository")}:${preferred.evidence[0]?.line ?? 1}).`,
      );
  }
  const serviceFindings = named("setup.service");
  const services = unique(
    serviceFindings.map((item) => data(item, "name") ?? ""),
  ).filter(Boolean);
  if (services.length)
    lines.push(
      `- **Observed in Compose:** Services: ${safe(services.join(", "))}${services
        .flatMap((service) => {
          const dependencies = unique(
            serviceFindings
              .filter((item) => data(item, "name") === service)
              .map((item) => data(item, "dependsOn") ?? ""),
          ).filter(Boolean);
          return dependencies.length
            ? [`; ${service} depends on ${dependencies.join(", ")}`]
            : [];
        })
        .join("")}. Local availability is runtime unverified.`,
    );
  const envNames = unique(
    named("environment.variable").map((item) => data(item, "name") ?? ""),
  ).filter(Boolean);
  for (const [purpose, pattern] of [
    ["database", /^(?:DB_|DATABASE_|POSTGRES_)/u],
    ["cache and messaging", /^(?:REDIS_)/u],
    ["application", /^(?:PORT|NODE_ENV)$/u],
  ] as const) {
    const selected = envNames
      .filter((name) => pattern.test(name))
      .sort()
      .slice(0, 5);
    if (selected.length)
      lines.push(
        `- **Observed in code — ${purpose} variable names:** ${safe(selected.join(", "))}. Values are not read; required settings are unverified.`,
      );
  }
  const appDefault = named("setup.port").find((item) =>
    data(item, "defaultPort"),
  );
  const questions: string[] = [];
  const requirements = named("setup.requirement");
  const envFiles = requirements.filter(
    (item) => data(item, "type") === "envFile",
  );
  const initMounts = requirements.filter(
    (item) => data(item, "type") === "initMount",
  );
  const builtOutput = requirements.find(
    (item) => data(item, "type") === "builtOutput",
  );
  const mappings = named("setup.port").filter((item) =>
    data(item, "containerPort"),
  );
  const mappedService =
    (builtOutput ? data(builtOutput, "service") : undefined) ??
    (mappings.length === 1 ? data(mappings[0]!, "service") : undefined);
  const appMapping = mappings.find(
    (item) => data(item, "service") === mappedService,
  );
  const dockerBuild = requirements.find(
    (item) => data(item, "type") === "dockerBuild",
  );
  for (const item of envFiles)
    lines.push(
      `- **Observed in Compose:** ${safe(data(item, "service") ?? "A service")} requires ${safe(data(item, "path") ?? "an environment file")} (${reference(item.evidence[0]!)}). Contents and availability are unverified.`,
    );
  for (const item of initMounts)
    lines.push(
      `- **Observed in Compose:** ${safe(data(item, "service") ?? "A service")} mounts initialization file ${safe(data(item, "path") ?? "unknown")} (${reference(item.evidence[0]!)}). ${data(item, "present") === "yes" ? "The file exists in the repository" : data(item, "present") === "no" ? "The file was not found in the repository" : "File availability is unverified"}; initialization effects are unverified.`,
    );
  if (builtOutput)
    lines.push(
      `- **Observed in Compose:** ${safe(data(builtOutput, "service") ?? "A service")} starts compiled output (${reference(builtOutput.evidence[0]!)}). ${dockerBuild ? `The Dockerfile includes a build step (${reference(dockerBuild.evidence[0]!)}).` : "A build step was not found in the inspected Dockerfile."} Runtime unverified.`,
    );
  if (
    appMapping &&
    appDefault &&
    data(appMapping, "containerPort") !== data(appDefault, "defaultPort")
  )
    questions.push(
      `Compose maps ${safe(mappedService ?? "a service")} host ${data(appMapping, "hostPort")} to container ${data(appMapping, "containerPort")}, but the statically resolved listen fallback is ${data(appDefault, "defaultPort")}. Is PORT set to the mapped container port?`,
    );
  if (!setupCommands.some((item) => data(item, "purpose") === "install"))
    questions.push(
      "Which install command and prerequisite versions should a newcomer use?",
    );
  if (!setupCommands.some((item) => data(item, "purpose") === "start"))
    questions.push("How should a newcomer start the app?");
  if (!setupCommands.some((item) => data(item, "purpose") === "test"))
    questions.push("Which test command should a newcomer run?");
  if (
    services.length &&
    !envFiles.length &&
    !named("environment.template").length
  )
    questions.push(
      "Which local environment settings are required, and where are they documented?",
    );
  if (envFiles.length && !named("environment.template").length)
    questions.push(
      `Where should a newcomer obtain ${unique(envFiles.map((item) => data(item, "path") ?? "the environment file")).join(", ")}, and which names are required?`,
    );
  if (initMounts.length)
    questions.push(
      initMounts.some((item) => data(item, "present") === "no")
        ? "Where can the missing mounted initialization files be obtained, and when should they run?"
        : "Are the mounted initialization files intended for local setup, and when should they run?",
    );
  if (builtOutput && !dockerBuild)
    questions.push(
      "What build step produces the compiled output before the container starts?",
    );
  if (
    setupCommands.some((item) => data(item, "purpose") === "compiled-start") &&
    !setupCommands.some(
      (item) =>
        data(item, "purpose") === "build" &&
        item.evidence[0]?.file === "README.md",
    )
  )
    questions.push(
      setupCommands.some((item) => data(item, "purpose") === "build")
        ? "The README lists a compiled start without a build step; is the package build script required first, and what prerequisites does it need?"
        : "For a non-container compiled start, what build step and prerequisites are required?",
    );
  if (questions.length)
    lines.push(
      "",
      "**Questions to verify:**",
      "",
      ...questions.map((question) => `- ${safe(question)}`),
    );
  lines.push(
    ...details(
      [
        ...setupCommands.slice(0, 3),
        ...serviceFindings.slice(0, 5),
        ...named("setup.port"),
        ...requirements,
      ].flatMap((item) => item.evidence),
    ),
    "",
    "## Unknowns",
    "",
    ...specificUnknowns(findings, flows),
    "- **Unknown:** Which flows matter most to the team, and who owns their outcomes? Ask a knowledgeable person.",
    setupCommands.length
      ? "- **Runtime unverified:** Which documented setup steps work in the intended local environment?"
      : "- **Runtime unverified:** Which setup steps work in the intended local environment?",
    "- **Unknown:** What are the production topology and operational owners? Ask a knowledgeable person.",
    "",
  );
  return `${lines
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd()}\n`;
}

function fact(label: string, statement: string, present: boolean): string[] {
  return present ? [`- **${label}:** ${safe(statement)}`] : [];
}

function reference(item: Evidence): string {
  return `\`${safe(`${item.file}${item.line ? `:${item.line}` : ""}`).replace(/`/gu, "'")}\``;
}

function specificUnknowns(
  findings: readonly Finding[],
  flows: readonly CandidateFlow[],
): string[] {
  const questions: string[] = [];
  for (const flow of flows) {
    const trace = findings.find(
      (item) =>
        item.kind === "application.route-trace" &&
        typeof item.data === "object" &&
        item.data !== null &&
        flow.sourceFindingIds.includes(
          (item.data as RouteTrace).routeFindingId,
        ),
    );
    const operations =
      (trace?.data as RouteTrace | undefined)?.operations ?? [];
    const saves = operations.filter(
      (item) =>
        item.kind === "call" &&
        item.category === "repository" &&
        item.method === "save" &&
        item.awaited,
    );
    const unconditioned = saves.filter((item) => !item.conditional);
    const pair =
      unconditioned.length > 1
        ? unconditioned.slice(0, 2)
        : unconditioned.length && saves.length > 1
          ? [
              unconditioned[0]!,
              saves.find(
                (item) =>
                  item.conditional &&
                  operations.indexOf(item) >
                    operations.indexOf(unconditioned[0]!),
              ),
            ].filter(
              (item): item is (typeof saves)[number] => item !== undefined,
            )
          : [];
    if (pair.length === 2)
      questions.push(
        `- **Unknown:** ${safe(flow.title)} contains ordered, separate awaited save calls (${pair
          .map((item) => reference(item.evidence[0]!))
          .join(
            ", ",
          )}). Can one path execute both? If so, could a later failure leave partial state, and what recovery is intended?`,
      );
    const caught = operations.find(
      (item) =>
        item.kind === "call" &&
        item.category === "service" &&
        (item.catchDepth ?? 0) > 0 &&
        /(?:upload|send|notify|publish|request|generate)/iu.test(
          item.method ?? "",
        ),
    );
    if (caught)
      questions.push(
        `- **Unknown:** ${safe(flow.title)} calls ${safe(`${caught.target}.${caught.method}`)} inside a caught try block (${reference(caught.evidence[0]!)}). If that call fails, what state remains and what recovery is intended?`,
      );
  }
  return questions;
}

function explainedDetails(
  flow: ExplainedFlow,
  routeEvidence: readonly Evidence[],
): string[] {
  const references = flow.steps.map((step, index) => ({
    index: index + 1,
    locations: unique(
      (step.citations?.length ? step.citations : step.evidence)
        .slice(0, 3)
        .filter(
          (item) =>
            item.file &&
            !item.file.startsWith("/") &&
            !item.file.startsWith(".."),
        )
        .map((item) => `${item.file}${item.line ? `:${item.line}` : ""}`),
    ),
  }));
  return [
    "<details><summary>Code references by step</summary>",
    "",
    ...(routeEvidence.length
      ? [`- Route: ${unique(routeEvidence.map(reference)).join(", ")}`]
      : []),
    ...references.map(
      ({ index, locations }) =>
        `- Step ${index}: ${locations.map((item) => `\`${safe(item).replace(/`/gu, "'")}\``).join(", ")}`,
    ),
    "",
    "</details>",
  ];
}

function selectRelationships(
  relations: readonly ComponentRelationship[],
  components: Map<string, ProjectModel["components"][number]>,
  preferred: Set<string>,
): ComponentRelationship[] {
  const order: ComponentRelationship["kind"][] = [
    "MODULE_IMPORT",
    "MODULE_CONTROLLER",
    "CONTROLLER_SERVICE",
    "SERVICE_ENTITY",
    "SERVICE_INTEGRATION",
    "JOB_SERVICE",
  ];
  return order.flatMap((kind) =>
    relations
      .filter(
        (relation) =>
          relation.kind === kind &&
          (kind !== "MODULE_IMPORT" ||
            components.get(relation.to)?.kind === "MODULE"),
      )
      .sort(
        (left, right) =>
          Number(preferred.has(right.from)) +
            Number(preferred.has(right.to)) -
            Number(preferred.has(left.from)) -
            Number(preferred.has(left.to)) ||
          `${components.get(left.from)?.name} ${components.get(left.to)?.name}`.localeCompare(
            `${components.get(right.from)?.name} ${components.get(right.to)?.name}`,
          ),
      )
      .slice(0, 2),
  );
}

function selectFlows(
  candidates: readonly CandidateFlow[],
  model: ProjectModel,
  findings: readonly Finding[],
): CandidateFlow[] {
  const ranked = [...candidates].sort(
    (left, right) =>
      flowScore(right, findings) - flowScore(left, findings) ||
      left.title.localeCompare(right.title) ||
      left.entryPoints.join().localeCompare(right.entryPoints.join()) ||
      left.id.localeCompare(right.id),
  );
  const selected: CandidateFlow[] = [];
  const domainCounts = new Map<string, number>();
  for (const flow of ranked) {
    const start = flow.componentIds[0];
    const domain =
      model.domains.find(
        (item) =>
          item.name !== "Module" && item.controllers.includes(start ?? ""),
      )?.id ??
      flow.domainIds[0] ??
      flow.id;
    if ((domainCounts.get(domain) ?? 0) >= 2) continue;
    selected.push(flow);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    if (selected.length === 3) break;
  }
  return selected;
}

function flowScore(flow: CandidateFlow, findings: readonly Finding[]): number {
  const entries = flow.entryPoints.join(" ").toLowerCase();
  const title = flow.title.toLowerCase();
  const unresolved = entries.includes("path unresolved");
  const mutation = /^(?:POST|PUT|PATCH|DELETE)\s+\//iu.test(
    flow.entryPoints[0] ?? "",
  );
  const action =
    /(?:^|[\s/:-])(?:add|create|submit|approve|reject|cancel|update|activate|process|send|confirm|archive|publish|assign|complete)(?:[\s/:-]|$)/u.test(
      `${entries} ${title}`,
    );
  const generic =
    /(?:^|[\s/:-])(?:get|find|list|search|lookup|login|logout|auth|token|password|session|profile|email|otp|callback|webhook)(?:[\s/:-]|$)/u.test(
      `${entries} ${title}`,
    );
  const trace = findings.find(
    (item) =>
      item.kind === "application.route-trace" &&
      typeof item.data === "object" &&
      item.data !== null &&
      flow.sourceFindingIds.includes((item.data as RouteTrace).routeFindingId),
  );
  const operations = (trace?.data as RouteTrace | undefined)?.operations ?? [];
  const meaningful = operations.filter(
    (item) =>
      item.kind === "guard" ||
      item.kind === "branch" ||
      item.kind === "assignment" ||
      (item.kind === "call" &&
        item.category === "repository" &&
        item.method === "save"),
  ).length;
  return (
    (unresolved ? 0 : 10) +
    (mutation ? 6 : 0) +
    (action ? 8 : 0) -
    (generic ? 12 : 0) +
    Math.min(meaningful * 2, 20) +
    Math.min(flow.steps.length, 5)
  );
}

function details(evidence: readonly Evidence[]): string[] {
  const references = unique(
    evidence
      .filter(
        (item) =>
          item.file &&
          !item.file.startsWith("/") &&
          !item.file.startsWith(".."),
      )
      .map((item) => `${item.file}${item.line ? `:${item.line}` : ""}`),
  ).slice(0, 12);
  if (references.length === 0) return [];
  return [
    "",
    "<details><summary>Repository references</summary>",
    "",
    ...references.map((item) => `- \`${safe(item).replace(/`/gu, "'")}\``),
    "",
    "</details>",
  ];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function safe(value: string): string {
  return sanitizeHandoverValue(value)
    .replace(/[\r\n]+/gu, " ")
    .replace(/[<>]/gu, "");
}
