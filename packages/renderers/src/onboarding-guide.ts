import type {
  CandidateFlow,
  ComponentRelationship,
  Evidence,
  ExplainedFlow,
  Finding,
  OnboardingTrace,
  OnboardingSelectedConcept,
  OnboardingQueueContinuation,
  OnboardingRepositoryNote,
  OnboardingScheduledConcept,
  OnboardingStoryInventory,
  OnboardingStorySelection,
  ProjectModel,
  RouteTrace,
} from "@transferkit/core";
import { sanitizeHandoverValue } from "./handover-package.js";
import { renderHumanOnboardingGuide } from "./onboarding-human-story.js";

const genericIntegrations = new Set([
  "axios",
  "fetch",
  "http",
  "http client",
  "httpservice",
  "nestjs httpservice",
  "unknown http integration",
]);

export interface OnboardingGuideJourney {
  trace: OnboardingTrace;
  reason: string;
  continuations: readonly OnboardingQueueContinuation[];
}

export interface OnboardingGuideOptions {
  journeys?: readonly OnboardingGuideJourney[];
  concepts?: readonly OnboardingSelectedConcept[];
  scheduled?: readonly OnboardingScheduledConcept[];
  displayFlowIds?: readonly string[];
  rejected?: readonly { symbol: string; reason: string }[];
  repositoryNotes?: readonly OnboardingRepositoryNote[];
  storyInventory?: OnboardingStoryInventory;
  storySelection?: OnboardingStorySelection;
}

export function renderOnboardingGuide(
  model: ProjectModel,
  findings: readonly Finding[],
  explanations: readonly ExplainedFlow[] = [],
  options: OnboardingGuideOptions = {},
): string {
  const journeys = options.journeys ?? [];
  const deepTrace = journeys[0]?.trace;
  const concepts = options.concepts ?? [];
  const scheduled = options.scheduled ?? [];
  const repositoryNotes = options.repositoryNotes ?? [];
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
  const flows = options.displayFlowIds
    ? options.displayFlowIds.flatMap((id) =>
        model.candidateFlows.filter((flow) => flow.id === id),
      )
    : selectOnboardingFlows(model.candidateFlows, model, findings);
  const eligible = flows.flatMap((flow) =>
    options.journeys
      ? []
      : explanations.filter((item) =>
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
    ...named("application.module").filter((item) =>
      rootModules.some((module) => module.name === data(item, "name")),
    ),
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
    "Start with the system map, trace a flow, then try a local run. Record what you learn in `.transferkit.local/ONBOARDING.md`.",
    "",
    "This guide uses repository evidence. Module names and declarations suggest relationships; commands come from documentation or configuration. Runtime behavior remains unverified until you try it. Open each reference block for the nearby source locations.",
    "",
    "## System overview",
    "",
    ...repositoryNotes
      .filter((note) => note.kind === "description")
      .flatMap((note) => [
        `**Project description (README statement):** ${safe(note.text)} ${sourceLink(note)}`,
        "",
      ]),
    ...repositoryNotes
      .filter((note) => note.kind === "entry")
      .flatMap((note) => [
        `**JavaScript entry (package start script):** ${safe(note.text)} ${sourceLink(note)}`,
        "",
      ]),
    ...fact(
      "Bootstrap",
      `${entryFiles.join(", ")} creates ${unique(names("application.entry-point", "module")).join(", ")}`,
      entryFiles.length > 0,
    ),
    ...fact(
      "Technology",
      unique([...names("framework"), ...names("language")]).join(", "),
      names("framework").length + names("language").length > 0,
    ),
    ...fact(
      "Root module",
      rootModules.map((item) => item.name).join(", "),
      rootModules.length > 0,
    ),
    ...fact("Root imports", rootImports.join(", "), rootImports.length > 0),
    ...fact(
      "Other feature modules (by name)",
      unique(
        featureModules
          .filter((item) => !rootImports.includes(item.name))
          .map((item) => item.name),
      )
        .sort()
        .join(", "),
      featureModules.some((item) => !rootImports.includes(item.name)),
    ),
    ...fact(
      "Other support modules (by name)",
      unique(
        supportModules
          .filter((item) => !rootImports.includes(item.name))
          .map((item) => item.name),
      )
        .sort()
        .join(", "),
      supportModules.some((item) => !rootImports.includes(item.name)),
    ),
    ...fact(
      "Data store",
      names("database").join(", "),
      names("database").length > 0,
    ),
    ...fact(
      "Integration names to investigate",
      integrations.sort().join(", "),
      integrations.length > 0,
    ),
    ...fact(
      "Scheduled handlers",
      names("scheduled-job").sort().join(", "),
      names("scheduled-job").length > 0,
    ),
  ];
  if (
    lines.at(-1) === "" &&
    !repositoryNotes.some(
      (note) => note.kind === "description" || note.kind === "entry",
    )
  )
    lines.push(
      "No system components were identified from supported static evidence.",
    );
  lines.push(
    "",
    ...details(overviewEvidence, "System references"),
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
      "Declared relationships suggest where to inspect next; they do not establish runtime calls.",
      "",
    );
  for (const relation of relationships) {
    const from = components.get(relation.from)?.name;
    const to = components.get(relation.to)?.name;
    if (from && to)
      lines.push(
        `- ${safe(from)} → ${safe(to)} (${relation.kind.toLowerCase().replace(/_/gu, " ")})`,
      );
  }
  lines.push(...details(relationships.flatMap((item) => item.evidence)), "");
  if (concepts.length) {
    const selectedNames = new Set(concepts.map((item) => item.entity.name));
    lines.push(
      "## Concepts",
      "",
      "TypeORM declarations and statically selected calls near the source journey. Names and call shapes do not establish business meaning or completed database effects.",
      "",
    );
    const storeEvidence = named("database");
    if (storeEvidence.length)
      lines.push(
        `**Declared data store:** ${safe(names("database").join(", "))} (${unique(storeEvidence.flatMap((item) => item.evidence.map(reference))).join(", ")}).`,
        "",
      );
    for (const concept of concepts.slice(0, 5)) {
      const { entity } = concept;
      const calls = concept.calls.slice(0, 3);
      const relevantFields = entity.fields.filter((field) =>
        deepTrace?.methods.some((method) =>
          method.events.some((event) =>
            event.detail.includes(`.${field.name}`),
          ),
        ),
      );
      const fields = (
        relevantFields.length ? relevantFields : entity.fields
      ).slice(0, 5);
      const relations = entity.relations.filter((relation) =>
        selectedNames.has(relation.target),
      );
      lines.push(
        `### ${safe(entity.name)}`,
        "",
        `- Declared entity: ${sourceLink(entity.declaration)}.`,
        concept.calls.length
          ? `- Journey references: ${calls.map((call) => `${call.effect === "unspecified" ? "call" : `${call.effect} call`} at ${sourceLink(call.at)}`).join(", ")}${concept.calls.length > calls.length ? `; ${concept.calls.length - calls.length} more call sites` : ""}.`
          : "- Direct relation from a touched entity; no selected journey call was linked to this entity.",
        ...(fields.length
          ? [
              `- Declared fields to inspect: ${fields.map((field) => `${safe(field.name)} (${sourceLink(field.at)})`).join(", ")}.`,
            ]
          : []),
        ...relations.map(
          (relation) =>
            `- Declared ${safe(relation.kind)} relation ${safe(relation.property)} → ${safe(relation.target)} (${sourceLink(relation.at)}).`,
        ),
        "",
      );
    }
    if (concepts.length > 5)
      lines.push(
        "<details><summary>Other entity declarations linked to this journey</summary>",
        "",
        ...concepts
          .slice(5)
          .map(
            (concept) =>
              `- ${safe(concept.entity.name)}: ${sourceLink(concept.entity.declaration)}; ${concept.calls.length} selected call site(s).`,
          ),
        "",
        "</details>",
        "",
      );
  }
  if (scheduled.length)
    lines.push(
      "## Scheduled work",
      "",
      "These are declared handlers with direct, typed repository call sites touching concepts above. A schedule declaration does not prove a run or its effects.",
      "",
      ...scheduled.map(
        (item) =>
          `- ${safe(item.job)}${item.schedule ? ` (declared schedule ${safe(item.schedule)})` : ""} at ${sourceLink(item.registration)}: ${item.effect === "unspecified" ? "calls" : `${item.effect} call involving`} ${safe(item.entity)} at ${sourceLink(item.at)}.`,
      ),
      "",
    );
  const migrationNotes = repositoryNotes.filter(
    (note) => note.kind === "migration",
  );
  if (migrationNotes.length)
    lines.push(
      "## Related migration candidates",
      "",
      "These file names match selected source owners. Inspect the migrations before treating them as an explanation of current data behavior.",
      "",
      ...migrationNotes.map(
        (note) => `- ${safe(note.text)} ${sourceLink(note)}`,
      ),
      "",
    );
  if (explained.length || journeys.length)
    lines.push(
      "## Explained flow",
      "",
      "Partial traces from method bodies. Check the cited steps and open gaps before relying on an outcome.",
      "",
      ...journeys.flatMap((journey) => [
        ...renderDeepTrace(journey.trace, journey.continuations),
        ...repositoryNotes
          .filter((note) => note.journey === journey.trace.entry.symbol)
          .flatMap((note) => [
            `- ${note.kind === "comment" ? "Source comment says" : note.kind === "test" ? "Related test candidate" : "Migration candidate"}: ${safe(note.text)} ${sourceLink(note)}`,
          ]),
        `**Selection:** ${safe(journey.reason)}. This describes source coverage, not business priority.`,
        "",
      ]),
      ...explained.flatMap((flow) => [
        `### ${safe(flowTitle(flow.title, flow.entryPoint))}`,
        "",
        `**Route:** ${safe(flow.entryPoint)}`,
        "",
        ...flow.steps.map((step, index) => `${index + 1}. ${safe(step.text)}`),
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
      !journeys.some((journey) =>
        flow.entryPoints.includes(
          `${journey.trace.entry.verb ?? ""} ${journey.trace.entry.path ?? ""}`.trim(),
        ),
      ) &&
      !explained.some((item) =>
        flow.sourceFindingIds.includes(item.routeFindingId),
      ),
  );
  if (remainingFlows.length)
    lines.push(
      "Route starting points inferred from names and linked evidence. Trace calls, decisions, and persistence before treating these as complete flows.",
      "",
    );
  if (remainingFlows.length === 0)
    lines.push(
      options.rejected?.length
        ? "Other traced candidates were not featured; see the selection notes below."
        : explained.length || journeys.length
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
      `### ${safe(flowTitle(flow.title, flow.entryPoints[0] ?? ""))}`,
      "",
      `- **Route candidate:** ${safe(flow.entryPoints.join(", ") || "Entry point unknown")}`,
      `- **Start:** ${safe(start ?? "not identified")}. ${trace ? `Direct service method: ${safe(data(trace, "serviceMethod") ?? "unresolved")}.` : "Direct service method unresolved."}`,
      ...details([...(route?.evidence ?? []), ...(trace?.evidence ?? [])]),
      "",
    );
  }
  if (options.rejected?.length)
    lines.push(
      "<details><summary>Other traced candidates and selection reasons</summary>",
      "",
      ...options.rejected
        .slice(0, 8)
        .map((item) => `- ${safe(item.symbol)}: ${safe(item.reason)}`),
      "",
      "</details>",
      "",
    );
  lines.push(
    "## Setup and operations",
    "",
    "Commands below are documented or configured; check prerequisites and record what actually works.",
    "",
  );
  const setupCommands = named("setup.command");
  for (const purpose of [
    "install",
    "build",
    "start",
    "compiled-start",
    "test",
    "migration",
    "seed",
  ]) {
    const commands = setupCommands.filter(
      (item) => data(item, "purpose") === purpose,
    );
    const preferred =
      commands.find((item) => item.evidence[0]?.file === "README.md") ??
      commands[0];
    if (preferred)
      lines.push(
        `- **${purpose === "compiled-start" ? "Compiled start" : purpose[0]!.toUpperCase() + purpose.slice(1)}:** \`${safe(data(preferred, "command") ?? "")}\` (${preferred.evidence[0]?.file === "README.md" ? (data(preferred, "generic") === "yes" ? "generic starter README command" : "documented command") : "declared package script"} at ${reference(preferred.evidence[0]!)}; not run)`,
      );
  }
  const serviceFindings = named("setup.service");
  const services = unique(
    serviceFindings.map((item) => data(item, "name") ?? ""),
  ).filter(Boolean);
  if (services.length)
    lines.push(
      `- **Compose services:** ${safe(services.join(", "))}${services
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
        .join("")}.`,
    );
  const envNames = unique(
    [...named("environment.variable"), ...named("setup.variable")].map(
      (item) => data(item, "name") ?? "",
    ),
  ).filter(Boolean);
  const templateVariables = named("setup.variable");
  if (templateVariables.length)
    lines.push(
      `- **Template variable names:** ${safe(
        unique(templateVariables.map((item) => data(item, "name") ?? ""))
          .sort()
          .slice(0, 16)
          .join(", "),
      )}. Values are omitted; see ${reference(templateVariables[0]!.evidence[0]!)}.`,
    );
  const migrations = named("database.migration");
  if (migrations.length)
    lines.push(
      `- **Migration declarations:** ${migrations.length} file(s) found (for example ${reference(migrations[0]!.evidence[0]!)}); execution order and local need are unverified.`,
    );
  const health = named("application.route").find(
    (item) =>
      data(item, "verb")?.toUpperCase() === "GET" &&
      /\/(?:health|healthz|ready|readiness)\/?$/iu.test(
        data(item, "path") ?? "",
      ),
  );
  if (health)
    lines.push(
      `- **Possible health route:** GET ${safe(data(health, "path") ?? "")} is declared at ${reference(health.evidence[0]!)}; response and reachability are unverified.`,
    );
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
        `- **${purpose[0]!.toUpperCase() + purpose.slice(1)} settings:** ${safe(selected.join(", "))}. Values and required settings are unverified.`,
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
      `- **Environment file:** ${safe(data(item, "service") ?? "A service")} requires ${safe(data(item, "path") ?? "an environment file")} (${reference(item.evidence[0]!)}). Contents and availability are unverified.`,
    );
  for (const item of initMounts)
    lines.push(
      `- **Initialization file:** ${safe(data(item, "service") ?? "A service")} mounts ${safe(data(item, "path") ?? "unknown")} (${reference(item.evidence[0]!)}). ${data(item, "present") === "yes" ? "Present in the repository" : data(item, "present") === "no" ? "Missing from the repository" : "Availability unverified"}; initialization effects are unverified.`,
    );
  if (builtOutput)
    lines.push(
      `- **Compiled start:** ${safe(data(builtOutput, "service") ?? "A service")} starts compiled output (${reference(builtOutput.evidence[0]!)}). ${dockerBuild ? `The Dockerfile includes a build step (${reference(dockerBuild.evidence[0]!)}).` : "No build step was found in the inspected Dockerfile."} Verify the build before running.`,
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
  const declared = (purpose: string): string | undefined => {
    const item = setupCommands.find(
      (finding) => data(finding, "purpose") === purpose,
    );
    return item ? data(item, "command") : undefined;
  };
  const proposed = [
    declared("install")
      ? `Review prerequisites, then consider ${declared("install")}.`
      : "Confirm package installation and prerequisite versions.",
    services.length
      ? `Check Compose services (${services.join(", ")}) and required files before starting them.`
      : "Check required local services and configuration.",
    declared("build")
      ? `If compiled output is needed, consider ${declared("build")}.`
      : "Check whether a build is required.",
    declared("start")
      ? `Consider ${declared("start")} after prerequisites are ready.`
      : "Confirm the application start command.",
    health
      ? `If safe, inspect the declared GET ${data(health, "path")} route and record the actual response.`
      : "Choose a safe observation and record its actual result or blocker.",
  ];
  lines.push(
    "",
    "**Proposed order (inferred from declarations; do not run blindly):**",
    "",
    ...proposed.map((step, index) => `${index + 1}. ${safe(step)}`),
  );
  if (
    setupCommands.some((item) =>
      ["migration", "seed"].includes(data(item, "purpose") ?? ""),
    ) ||
    migrations.length
  )
    questions.push(
      "Are migrations or seeds needed locally, in what order, and who approves running them?",
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
      [...named("setup.port"), ...requirements].flatMap(
        (item) => item.evidence,
      ),
      "Configuration references",
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
  const source = `${lines
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd()}\n`;
  return options.storyInventory && options.storySelection
    ? renderHumanOnboardingGuide(
        source,
        options.storyInventory,
        options.storySelection,
        repositoryNotes,
      )
    : arrangeGuide(source, journeys);
}

function arrangeGuide(
  source: string,
  journeys: readonly OnboardingGuideJourney[],
): string {
  const headers = [...source.matchAll(/^## (.+)$/gmu)];
  const sections = new Map(
    headers.map((header, index) => [
      header[1]!,
      source
        .slice(
          header.index! + header[0].length,
          headers[index + 1]?.index ?? source.length,
        )
        .trim(),
    ]),
  );
  const overview = (sections.get("System overview") ?? "").split("\n");
  const detailStart = overview.findIndex((line) =>
    line.startsWith("<details>"),
  );
  const overviewFacts =
    detailStart < 0 ? overview : overview.slice(0, detailStart);
  const systemDetails =
    detailStart < 0 ? "" : overview.slice(detailStart).join("\n").trim();
  const inventory = overviewFacts.filter((line) =>
    /^- \*\*(?:Root imports|Other feature modules|Other support modules|Integration names to investigate|Scheduled handlers)/u.test(
      line,
    ),
  );
  const retainedInventory = overviewFacts.some(
    (line) => /^- \*\*/u.test(line) && !inventory.includes(line),
  )
    ? undefined
    : (inventory.find((line) => /Other feature modules/u.test(line)) ??
      inventory[0]);
  const system = overviewFacts
    .filter((line) => !inventory.includes(line) || line === retainedInventory)
    .join("\n")
    .trim();
  const architecture = sections.get("Architecture relationships") ?? "";
  const featuredOwners = [
    ...(sections.get("Explained flow") ?? "").matchAll(
      /^### Source journey: ([^.\n]+)\./gmu,
    ),
  ].map((match) => match[1]!);
  const relationshipLines = architecture
    .split("\n")
    .filter((line) => /^- [^*]/u.test(line) && line.includes("→"));
  const relevantRelationships = relationshipLines.filter((line) =>
    featuredOwners.some((owner) => line.includes(owner)),
  );
  const relationships = (
    relevantRelationships.length ? relevantRelationships : relationshipLines
  ).slice(0, 5);
  const journeyEdges = journeys
    .flatMap((journey) => {
      const call = journey.trace.calls.find(
        (item) =>
          item.caller === journey.trace.entry.symbol && item.declaredTarget,
      );
      return call
        ? [
            `- ${safe(call.caller)} → ${safe(call.declaredTarget!)} (declared call at ${sourceLink(call.site)})`,
          ]
        : [];
    })
    .slice(0, 5);
  const explained = sections.get("Explained flow") ?? "";
  const scheduled = sections.get("Scheduled work") ?? "";
  const changePoints = [
    ...explained.matchAll(
      /^### Source journey: (.+)$[\s\S]*?^\*\*Where to change:\*\* (.+)$/gmu,
    ),
  ].map(
    (match) =>
      `- [${safe(match[1]!)}](#journey-${anchor(match[1]!)}) — ${match[2]}`,
  );
  const setup = sections.get("Setup and operations") ?? "";
  const unknowns = sections.get("Unknowns") ?? "";
  const appendix = [
    ...(inventory.length
      ? [
          "**Additional inventory**",
          "",
          ...inventory.filter((line) => line !== retainedInventory),
          "",
        ]
      : []),
    ...(systemDetails
      ? ["**System citations and job signals**", "", systemDetails, ""]
      : []),
    ...(architecture
      ? ["**Architecture declarations and references**", "", architecture, ""]
      : []),
    ...(sections.get("Candidate flows")
      ? ["**Candidate routes**", "", sections.get("Candidate flows")!, ""]
      : []),
    ...(sections.get("Related migration candidates")
      ? [
          "**Migration candidates**",
          "",
          sections.get("Related migration candidates")!,
          "",
        ]
      : []),
  ];
  return (
    [
      "# Onboarding guide",
      "",
      "## Start here",
      "",
      `Read the [system map](#system-overview)${sections.get("Concepts") ? ", [concepts](#concepts)" : ""}, and [connected journeys](#explained-flow). Then choose a safe check from [Run and observe](#setup-and-operations) and record what happened in \`.transferkit.local/ONBOARDING.md\`. Source links support static claims; runtime results remain unverified.`,
      "",
      "## System map",
      "",
      '<a id="system-overview"></a>',
      "",
      system,
      ...(journeyEdges.length || relationships.length
        ? [
            "",
            journeyEdges.length
              ? "**Selected declared call targets:**"
              : "**Selected declared relationships:**",
            "",
            ...(journeyEdges.length ? journeyEdges : relationships),
            "",
            "Full declarations and citations are in the reference appendix.",
          ]
        : []),
      "",
      ...(sections.get("Concepts")
        ? ["## Concepts", "", sections.get("Concepts")!, ""]
        : []),
      "## Connected journeys",
      "",
      '<a id="explained-flow"></a>',
      "",
      ...(scheduled ? [scheduled, ""] : []),
      explained ||
        "No source journey was selected. Check candidate routes in the reference appendix.",
      "",
      "## Change points",
      "",
      ...(changePoints.length
        ? changePoints
        : [
            "No traced change point was established. Inspect the cited candidate routes before choosing a file.",
          ]),
      "",
      "## Run and observe",
      "",
      '<a id="setup-and-operations"></a>',
      "",
      setup,
      "",
      "## Specific questions",
      "",
      '<a id="unknowns"></a>',
      "",
      unknowns,
      "",
      "## Reference appendix",
      "",
      "<details><summary>Inventories, candidate routes, and supporting declarations</summary>",
      "",
      ...appendix,
      "</details>",
      "",
    ]
      .join("\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trimEnd() + "\n"
  );
}

function anchor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function fact(label: string, statement: string, present: boolean): string[] {
  return present ? [`- **${label}:** ${safe(statement)}`] : [];
}

function flowTitle(title: string, entryPoint: string): string {
  const words = title.trim().split(/\s+/u);
  if (words.length === 3 && words[0]?.toLowerCase() === words[2]?.toLowerCase())
    return `${words[0]} ${words[1]?.toLowerCase() === "add" ? "creation" : words[1]?.toLowerCase() === "initiate" ? "initiation" : words[1]}`;
  if (
    /^(?:GET|POST|PUT|PATCH|DELETE)\s+/u.test(entryPoint) &&
    words.length === 2 &&
    words[0]?.toLowerCase() === words[1]?.toLowerCase()
  )
    return `${words[0]} route`;
  return title;
}

function reference(item: Evidence): string {
  return `\`${safe(`${item.file}${item.line ? `:${item.line}` : ""}`).replace(/`/gu, "'")}\``;
}

function sourceLink(at: { file: string; line: number }): string {
  const path = at.file.split("/").map(encodeURIComponent).join("/");
  return `[${safe(`${at.file}:${at.line}`)}](${path}#L${at.line})`;
}

function renderDeepTrace(
  trace: OnboardingTrace,
  continuations: readonly OnboardingQueueContinuation[],
): string[] {
  const location = sourceLink;
  const methods = trace.methods.slice(0, 2);
  const lines = [
    `<a id="journey-${anchor(trace.entry.symbol)}"></a>`,
    "",
    `### Source journey: ${safe(trace.entry.symbol)}`,
    "",
    `**Entry:** ${trace.entry.kind === "scheduled" ? `Scheduled handler ${safe(trace.entry.symbol)}${trace.entry.schedule ? ` (declared schedule ${safe(trace.entry.schedule)})` : ""}` : safe([trace.entry.verb, trace.entry.path].filter(Boolean).join(" ") || trace.entry.symbol)} is declared at ${location(trace.entry.declaration)}. This is a static source trace; calls and outcomes are unverified at runtime.`,
    "",
  ];
  for (const method of methods) {
    lines.push(
      `**${safe(method.symbol)}** (${location(method.declaration)})`,
      "",
    );
    let assignments = 0;
    const significant = method.events.filter(
      (event) =>
        (event.kind === "assignment"
          ? assignments++ < 8
          : event.kind !== "call") ||
        event.effect ||
        trace.calls.some(
          (call) =>
            call.site.file === event.at.file &&
            call.site.line === event.at.line &&
            call.declaredTarget,
        ),
    );
    const visible =
      significant.length > 40
        ? significant.filter(
            (event, index) =>
              index < 20 ||
              event.effect === "write-like" ||
              event.effect === "transaction-like" ||
              (index >= significant.length - 10 && event.kind !== "assignment"),
          )
        : significant;
    for (const event of visible) {
      const path = event.path.length
        ? ` [${event.path.length > 2 ? "after earlier checks; " : ""}${safe(event.path.slice(-2).join("; "))}]`
        : "";
      const edge =
        event.kind === "call"
          ? trace.calls.find(
              (call) =>
                call.caller === method.symbol &&
                call.site.file === event.at.file &&
                call.site.line === event.at.line,
            )
          : undefined;
      const action =
        event.kind === "branch"
          ? `Checks ${safe(event.detail)}`
          : event.kind === "throw"
            ? `Throws ${safe(event.detail.replace(/^throw\s+/u, ""))}`
            : event.kind === "return"
              ? `Returns ${safe(event.detail.replace(/^return\s*/u, ""))}`
              : event.kind === "assignment"
                ? `Assigns ${safe(event.detail)}`
                : `${event.awaited ? "Awaits" : "Calls"} ${safe(event.detail)}${event.effect ? ` (${event.effect} attempt)` : ""}${edge?.declaredTarget ? `; declared target ${safe(edge.declaredTarget)} at ${location(edge.declaration!)}` : edge?.kind === "unresolved" ? "; target unresolved" : ""}`;
      lines.push(`- ${action}${path} — ${location(event.at)}`);
    }
    if (significant.length > visible.length)
      lines.push(
        `- ${significant.length - visible.length} further source events omitted from this compact view; inspect the cited method.`,
      );
    lines.push("");
  }
  if (trace.methods.length > methods.length)
    lines.push(
      `**Further declared methods:** ${trace.methods
        .slice(methods.length, methods.length + 8)
        .map(
          (method) =>
            `${safe(method.symbol)} (${location(method.declaration)})`,
        )
        .join(", ")}.`,
      "",
    );
  if (continuations.length) {
    lines.push("**Queue continuations:**", "");
    for (const continuation of continuations) {
      const { publication, handler } = continuation;
      lines.push(
        handler
          ? `- Possible continuation: ${safe(publication.caller)} calls BullMQ Queue.add for job ${safe(publication.job)} on ${safe(publication.queue)} at ${location(publication.at)} (injection ${location(publication.injection)}); ${safe(handler.symbol)} is registered for that queue at ${location(handler.registration)} (body ${location(handler.declaration)}). Enqueue, delivery, order, and handler success are unverified.`
          : `- Unconnected publication: ${safe(publication.caller)} calls BullMQ Queue.add for job ${safe(publication.job)} on ${safe(publication.queue)} at ${location(publication.at)}. ${safe(continuation.reason ?? "No supported handler link was found.")}`,
      );
    }
    lines.push("");
  }
  const relevantGaps = trace.gaps.filter((gap) =>
    methods.some((method) => method.declaration.file === gap.at.file),
  );
  const gaps = (relevantGaps.length ? relevantGaps : trace.gaps).filter(
    (gap, index, all) =>
      all.findIndex(
        (item) =>
          item.reason === gap.reason &&
          item.at.file === gap.at.file &&
          item.at.line === gap.at.line,
      ) === index,
  );
  lines.push("**First open boundaries:**", "");
  if (!gaps.length)
    lines.push(
      "- No analyzer gap was recorded; runtime outcomes remain unverified.",
    );
  for (const gap of gaps.slice(0, 6))
    lines.push(
      `- ${safe(gap.reason)}${gap.path.length ? ` [${safe(gap.path.join("; "))}]` : ""} — ${location(gap.at)}`,
    );
  lines.push(
    "",
    `**Where to change:** start at ${location(trace.entry.declaration)}${methods[1] ? ` and ${location(methods[1].declaration)}` : ""}. Related tests were not established by this trace; search for the cited symbols before changing behavior.`,
    "",
  );
  return lines;
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
        `- **Unknown:** ${safe(flowTitle(flow.title, flow.entryPoints[0] ?? ""))} contains ordered, separate awaited save calls (${pair
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
        `- **Unknown:** ${safe(flowTitle(flow.title, flow.entryPoints[0] ?? ""))} calls ${safe(`${caught.target}.${caught.method}`)} inside a caught try block (${reference(caught.evidence[0]!)}). If that call fails, what state remains and what recovery is intended?`,
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

export function selectOnboardingFlows(
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

function details(
  evidence: readonly Evidence[],
  title = "Repository references",
): string[] {
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
    `<details><summary>${title}</summary>`,
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
