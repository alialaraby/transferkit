import { randomUUID } from "node:crypto";
import type {
  CandidateFlow,
  Finding,
  HandoverItem,
  HandoverSection,
  ProjectDomain,
  ProjectModel,
  TransferHandoverPlan,
} from "@transferkit/core";
import {
  discoverSemanticIntegrations,
  providerFromName,
  type SemanticIntegration,
} from "./semantic-integrations.js";
import { understandProject } from "./project-understanding.js";

type Proposal = {
  section: string;
  key: string;
  title: string;
  type: HandoverItem["type"];
  priority: HandoverItem["priority"];
  findings?: readonly Finding[];
  points?: { id: string; text: string }[];
};

export const transferSectionTitles = [
  "System & Architecture",
  "Business Domains",
  "Critical Business Flows",
  "Data & Persistence",
  "External Services",
  "Authentication & Security",
  "Async Processing & Scheduled Jobs",
  "Deployment & Infrastructure",
  "Operations & Recovery",
  "Access & Ownership Transfer",
  "Open Work",
  "Known Issues & Risks",
  "Technical Debt",
  "Important Decisions / Tribal Knowledge",
  "Next Owner Verification",
  "Final Transfer Checks",
] as const;

const foundation: Proposal[] = [
  {
    section: "System & Architecture",
    key: "architecture",
    title: "Explain the system architecture and boundaries",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
    points: [
      {
        id: "architecture:components",
        text: "Major components and data paths",
      },
      { id: "architecture:change", text: "Where to start a change" },
    ],
  },
  {
    section: "Business Domains",
    key: "domains",
    title: "Explain the main business domains and responsibilities",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
  },
  {
    section: "Critical Business Flows",
    key: "flows",
    title: "Walk through the critical business flows and failure paths",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
  },
  {
    section: "Data & Persistence",
    key: "data",
    title: "Explain data ownership, migrations, and recovery",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
  },
  {
    section: "External Services",
    key: "services",
    title: "Review external service dependencies and failure handling",
    type: "WALKTHROUGH",
    priority: "RECOMMENDED",
  },
  {
    section: "Authentication & Security",
    key: "security",
    title: "Explain access boundaries and security operations",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
  },
  {
    section: "Async Processing & Scheduled Jobs",
    key: "async",
    title: "Explain asynchronous work and missed-run recovery",
    type: "WALKTHROUGH",
    priority: "RECOMMENDED",
  },
  {
    section: "Deployment & Infrastructure",
    key: "deployment",
    title: "Walk through deployment, configuration, and rollback",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
  },
  {
    section: "Operations & Recovery",
    key: "operations",
    title: "Demonstrate incident response and service recovery",
    type: "WALKTHROUGH",
    priority: "CRITICAL",
  },
  {
    section: "Access & Ownership Transfer",
    key: "ownership",
    title: "Assign production and provider ownership to the Next Owner",
    type: "OWNERSHIP",
    priority: "CRITICAL",
  },
  {
    section: "Open Work",
    key: "open-work",
    title: "Record and disposition remaining open work",
    type: "OPEN_WORK",
    priority: "CRITICAL",
  },
  {
    section: "Known Issues & Risks",
    key: "risks",
    title: "Record known risks and recovery or mitigation",
    type: "RISK",
    priority: "CRITICAL",
  },
  {
    section: "Technical Debt",
    key: "debt",
    title: "Record technical debt that affects future ownership",
    type: "OPEN_WORK",
    priority: "RECOMMENDED",
  },
  {
    section: "Important Decisions / Tribal Knowledge",
    key: "decisions",
    title: "Explain important decisions and tribal knowledge",
    type: "WALKTHROUGH",
    priority: "RECOMMENDED",
  },
  {
    section: "Next Owner Verification",
    key: "verify",
    title: "Next Owner demonstrates a safe deployment and recovery",
    type: "VERIFY",
    priority: "CRITICAL",
  },
  {
    section: "Final Transfer Checks",
    key: "final",
    title: "Confirm transfer tasks and outstanding exceptions",
    type: "ACTION",
    priority: "CRITICAL",
  },
];

export function suggestTransferPlan(
  findings: readonly Finding[],
): TransferHandoverPlan {
  const project = understandProject(findings);
  const integrations = discoverSemanticIntegrations(findings);
  const proposals: Proposal[] = foundation
    .filter(
      (proposal) =>
        (proposal.key !== "domains" || project.domains.length === 0) &&
        (proposal.key !== "flows" || project.candidateFlows.length === 0) &&
        (proposal.key !== "services" ||
          !project.operationalCapabilities.some(
            (capability) => capability.kind === "EXTERNAL_SERVICES",
          )) &&
        (proposal.key !== "async" ||
          !project.operationalCapabilities.some(
            (capability) =>
              capability.kind === "SCHEDULED_JOBS" ||
              capability.kind === "MESSAGING",
          )),
    )
    .map((proposal): Proposal => ({
      ...proposal,
      ...(proposal.points ? { points: [...proposal.points] } : {}),
    }));
  const architecture = proposals.find(
    (proposal) => proposal.key === "architecture",
  )!;
  const architecturePoints = projectArchitecturePoints(
    project,
    findings,
    integrations,
  );
  if (architecturePoints.length) {
    architecture.title = `Walk through ${project.domains.length > 0 && project.domains.length <= 3 ? project.domains.map((domain) => domain.name).join(", ") + " " : "the system "}architecture and boundaries`;
    architecture.points = architecturePoints;
    architecture.findings = sourceFindings(findings).filter((finding) =>
      [
        "application.entry-point",
        "application.module",
        "database",
        "database.configuration",
        "database.migration",
        "scheduled-job",
        "messaging.consumer",
        "integration",
        "containerization",
        "ci.workflow",
        "environment.template",
      ].includes(finding.kind),
    );
  }
  const dataItem = proposals.find((proposal) => proposal.key === "data")!;
  const detectedDatabases = [
    ...new Set(
      findings
        .filter((finding) => finding.kind === "database")
        .map((finding) => stringData(finding, "name"))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const detectedEntities = project.domains
    .flatMap((domain) => domain.entities)
    .map((id) => componentName(project, id));
  if (detectedDatabases.length || detectedEntities.length) {
    dataItem.title = `Walk through ${detectedDatabases.length ? detectedDatabases.join(" / ") : "project"} persistence and recovery`;
    dataItem.points = [
      ...(detectedDatabases.length
        ? [
            {
              id: "data:stores",
              text: `Detected data stores: ${detectedDatabases.join(", ")}`,
            },
          ]
        : []),
      ...(detectedEntities.length
        ? [
            {
              id: "data:entities",
              text: `Entity ownership to explain: ${[...new Set(detectedEntities)].slice(0, 5).join(", ")}`,
            },
          ]
        : []),
      ...findings
        .filter((finding) => finding.kind === "database.migration")
        .slice(0, 3)
        .map((finding) => ({
          id: `data:migration:${finding.id}`,
          text: `Explain migration order and rollback for ${finding.evidence[0]?.file ?? finding.id}`,
        })),
      {
        id: "data:migrations",
        text: "Migration and recovery procedure to confirm with the Current Owner",
      },
    ];
    dataItem.findings = sourceFindings(findings).filter((finding) =>
      [
        "database",
        "database.configuration",
        "database.entity",
        "database.migration",
      ].includes(finding.kind),
    );
  }
  const deploymentItem = proposals.find(
    (proposal) => proposal.key === "deployment",
  )!;
  const deploymentFindings = sourceFindings(findings).filter(
    (finding) =>
      finding.kind === "ci.workflow" || finding.kind === "containerization",
  );
  if (deploymentFindings.length) {
    deploymentItem.title =
      "Walk through detected deployment and rollback paths";
    deploymentItem.points = [
      {
        id: "deployment:files",
        text: `Detected deployment files: ${deploymentFindings
          .slice(0, 4)
          .map((finding) => finding.evidence[0]?.file)
          .filter(Boolean)
          .join(", ")}`,
      },
      {
        id: "deployment:rollback",
        text: "Rollback and recovery procedure to confirm with the Current Owner",
      },
    ];
    deploymentItem.findings = deploymentFindings;
  }
  for (const domain of project.domains.slice(0, 8)) {
    proposals.push({
      section: "Business Domains",
      key: domain.id,
      title: `Walk through the ${domain.name} domain`,
      type: "WALKTHROUGH",
      priority:
        domain.controllers.length || domain.services.length
          ? "CRITICAL"
          : "RECOMMENDED",
      points: domainPoints(domain, project, findings, integrations),
      findings: sourceFindings(findings).filter((finding) =>
        [
          ...domain.modules,
          ...domain.controllers,
          ...domain.services,
          ...domain.entities,
          ...domain.jobs,
        ].includes(finding.id),
      ),
    });
  }
  for (const flow of project.candidateFlows.slice(0, 10)) {
    const scheduled = flow.jobIds.length > 0;
    const flowJobs = findings.filter(
      (finding) => scheduled && flow.sourceFindingIds.includes(finding.id),
    );
    proposals.push({
      section: scheduled
        ? "Async Processing & Scheduled Jobs"
        : "Critical Business Flows",
      key: flow.id,
      title:
        scheduled && flowJobs.length === 1
          ? `Walk through ${humanizeJob(flowJobs[0]!)} scheduled job`
          : `Walk through ${flow.title}`,
      type: "WALKTHROUGH",
      priority: "RECOMMENDED",
      points: flowPoints(flow, project, findings, integrations),
      findings: sourceFindings(findings).filter(
        (finding) =>
          flow.sourceFindingIds.includes(finding.id) ||
          flow.componentIds.includes(finding.id) ||
          flow.integrationIds.some((id) =>
            integrations
              .find((integration) => `integration:${integration.id}` === id)
              ?.findings.some((related) => related.id === finding.id),
          ),
      ),
    });
  }
  for (const integration of integrations) {
    if (!integration.evidence.some((item) => item.file !== "package.json"))
      continue;
    if (integration.identity === "UNKNOWN") continue;
    const provider = integrationLabel(integration);
    const domain = project.domains.find((candidate) =>
      candidate.integrations.includes(`integration:${integration.id}`),
    );
    proposals.push({
      section: "External Services",
      key: `integration:${integration.id}`,
      title: `Walk through ${provider} integration`,
      type: "WALKTHROUGH",
      priority: "RECOMMENDED",
      points: integrationPoints(integration, provider, domain),
      findings: integration.findings.filter((finding) =>
        finding.evidence.some((item) => item.file !== "package.json"),
      ),
    });
    proposals.push({
      section: "Access & Ownership Transfer",
      key: `integration-owner:${integration.id}`,
      title: `Assign ${provider} integration ownership`,
      type: "OWNERSHIP",
      priority: "RECOMMENDED",
      findings: integration.findings.filter((finding) =>
        finding.evidence.some((item) => item.file !== "package.json"),
      ),
    });
  }
  const unknownIntegrations = integrations.filter(
    (integration) =>
      integration.identity === "UNKNOWN" &&
      integration.evidence.some((item) => item.file !== "package.json"),
  );
  if (unknownIntegrations.length)
    proposals.push({
      section: "External Services",
      key: "integration:unknown",
      title: "Identify unknown outbound integrations",
      type: "WALKTHROUGH",
      priority: "RECOMMENDED",
      findings: unknownIntegrations.flatMap(
        (integration) => integration.findings,
      ),
      points: [
        {
          id: "integration:unknown:identity",
          text: "Identify provider identities from the detected call sites",
        },
      ],
    });
  const jobs = findings.filter((finding) => finding.kind === "scheduled-job");
  const representedJobs = new Set(
    project.candidateFlows
      .filter((flow) => flow.jobIds.length > 0)
      .flatMap((flow) => flow.sourceFindingIds),
  );
  const unrepresentedJobs = jobs.filter((job) => !representedJobs.has(job.id));
  if (unrepresentedJobs.length)
    proposals.push({
      section: "Async Processing & Scheduled Jobs",
      key: "scheduled-jobs",
      title:
        unrepresentedJobs.length === 1
          ? `Walk through ${humanizeJob(unrepresentedJobs[0]!)} scheduled job`
          : "Walk through remaining scheduled jobs",
      type: "WALKTHROUGH",
      priority: "CRITICAL",
      points: jobPoints(unrepresentedJobs),
      findings: unrepresentedJobs,
    });
  const consumers = findings.filter(
    (finding) => finding.kind === "messaging.consumer",
  );
  if (consumers.length)
    proposals.push({
      section: "Async Processing & Scheduled Jobs",
      key: "consumers",
      title: "Walk through message consumers and retry or failure handling",
      type: "WALKTHROUGH",
      priority: "CRITICAL",
      findings: consumers,
    });
  const deployment = findings.filter(
    (finding) =>
      finding.kind === "ci.workflow" || finding.kind === "containerization",
  );
  if (
    deployment.length &&
    !proposals.some(
      (proposal) => proposal.key === "deployment" && proposal.points?.length,
    )
  )
    proposals.push({
      section: "Deployment & Infrastructure",
      key: "runtime",
      title: "Review detected build and runtime deployment paths",
      type: "WALKTHROUGH",
      priority: "RECOMMENDED",
      findings: deployment,
    });
  const database = findings.filter(
    (finding) =>
      finding.kind === "database" ||
      finding.kind === "database.entity" ||
      finding.kind === "database.configuration",
  );
  if (
    database.length &&
    !project.domains.some((domain) => domain.entities.length > 0)
  )
    proposals.push({
      section: "Data & Persistence",
      key: "detected-data",
      title: "Walk through detected persistence and migration paths",
      type: "WALKTHROUGH",
      priority: "RECOMMENDED",
      findings: database,
    });
  // A route is a useful starting point, but one item per route would swamp the plan.
  const routeFindings = findings.filter(
    (finding) => finding.kind === "application.route",
  );
  if (routeFindings.length && project.candidateFlows.length === 0)
    proposals.push({
      section: "Critical Business Flows",
      key: "detected-routes",
      title:
        "Review detected entry points and identify critical business paths",
      type: "WALKTHROUGH",
      priority: "RECOMMENDED",
      findings: routeFindings.slice(0, 8),
    });

  const sections: HandoverSection[] = transferSectionTitles.map(
    (title, index) => ({ id: `section:${index + 1}`, title, itemIds: [] }),
  );
  const items = proposals.map((proposal): HandoverItem => {
    const common = {
      id: randomUUID(),
      title: proposal.title,
      priority: proposal.priority,
      status: "TODO" as const,
      checklist: (proposal.points ?? []).map((point) => ({
        id: point.id,
        text: point.text,
        required: true,
        covered: false,
      })),
      attachments: [],
      repositoryContext: [
        ...new Map(
          [...(proposal.findings ?? [])]
            .sort(
              (left, right) =>
                contextRank(proposal.section, left.kind) -
                contextRank(proposal.section, right.kind),
            )
            .flatMap((finding) =>
              finding.evidence.map(
                (evidence) =>
                  [
                    evidence.file,
                    {
                      path: evidence.file,
                      ...(evidence.line ? { line: evidence.line } : {}),
                      ...(evidence.description
                        ? { description: evidence.description }
                        : {}),
                      findingId: finding.id,
                    },
                  ] as const,
              ),
            ),
        ).values(),
      ].slice(0, 6),
      provenance: {
        kind: "SUGGESTED" as const,
        suggestionId: proposal.key,
        decision: "PENDING" as const,
      },
    };
    const section = sections.find(
      (candidate) => candidate.title === proposal.section,
    )!;
    section.itemIds.push(common.id);
    switch (proposal.type) {
      case "WALKTHROUGH":
        return {
          ...common,
          type: "WALKTHROUGH",
          completion: { confirmed: false },
        };
      case "ACTION":
        return { ...common, type: "ACTION", completion: { performed: false } };
      case "OWNERSHIP":
        return { ...common, type: "OWNERSHIP", completion: {} };
      case "OPEN_WORK":
        return { ...common, type: "OPEN_WORK", completion: {} };
      case "RISK":
        return {
          ...common,
          type: "RISK",
          completion: { requiresOwnerOrAcceptance: true },
        };
      case "VERIFY":
        return { ...common, type: "VERIFY", completion: { succeeded: false } };
      case "REFERENCE":
        return {
          ...common,
          type: "REFERENCE",
          completion: { requiredAttachmentIds: [] },
        };
    }
  });
  return { id: randomUUID(), sections, items };
}

function projectArchitecturePoints(
  project: ProjectModel,
  findings: readonly Finding[],
  integrations: SemanticIntegration[],
): NonNullable<Proposal["points"]> {
  const points: NonNullable<Proposal["points"]> = [];
  const add = (id: string, text: string): void => {
    if (text) points.push({ id: `architecture:${id}`, text });
  };
  if (project.domains.length)
    add(
      "domains",
      `Boundaries between ${project.domains
        .slice(0, 5)
        .map((domain) => domain.name)
        .join(", ")}`,
    );
  const imports = project.relationships
    .filter((relationship) => relationship.kind === "MODULE_IMPORT")
    .slice(0, 4)
    .map(
      (relationship) =>
        `${componentName(project, relationship.from)} → ${componentName(project, relationship.to)}`,
    );
  if (imports.length)
    add("modules", `Module composition: ${imports.join(", ")}`);
  const entry = findings.find(
    (finding) => finding.kind === "application.entry-point",
  );
  if (entry)
    add(
      "entry",
      `Application entry point: ${stringData(entry, "module") ?? entry.evidence[0]?.file ?? ""}`,
    );
  const databases = [
    ...new Set(
      findings
        .filter((finding) => finding.kind === "database")
        .map((finding) => stringData(finding, "name"))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (databases.length)
    add("persistence", `Persistence: ${databases.join(", ")}`);
  const jobs = findings
    .filter((finding) => finding.kind === "scheduled-job")
    .slice(0, 3)
    .map((finding) => stringData(finding, "name") ?? finding.id);
  const consumers = findings
    .filter((finding) => finding.kind === "messaging.consumer")
    .slice(0, 2)
    .map((finding) => stringData(finding, "name") ?? finding.id);
  if (jobs.length || consumers.length)
    add(
      "background",
      `Background processing: ${[...jobs, ...consumers].join(", ")}`,
    );
  const providers = integrations
    .filter(
      (integration) =>
        integration.identity !== "UNKNOWN" &&
        integration.evidence.some(
          (evidence) => evidence.file !== "package.json",
        ),
    )
    .slice(0, 4)
    .map(integrationLabel);
  if (providers.length)
    add("providers", `External providers: ${providers.join(", ")}`);
  const deployment = [
    ...new Set(
      findings
        .filter(
          (finding) =>
            finding.kind === "containerization" ||
            finding.kind === "ci.workflow",
        )
        .map((finding) => finding.evidence[0]?.file)
        .filter((file): file is string => Boolean(file)),
    ),
  ].slice(0, 3);
  if (deployment.length)
    add("deployment", `Deployment and runtime files: ${deployment.join(", ")}`);
  const runtime = findings
    .filter((finding) => finding.kind === "environment.template")
    .map((finding) => finding.evidence[0]?.file)
    .filter((file): file is string => Boolean(file));
  if (runtime.length)
    add(
      "runtime",
      `Runtime configuration templates: ${runtime.slice(0, 3).join(", ")}`,
    );
  const migrations = findings
    .filter((finding) => finding.kind === "database.migration")
    .map((finding) => finding.evidence[0]?.file)
    .filter((file): file is string => Boolean(file));
  if (migrations.length)
    add(
      "migrations",
      `Migration entry points: ${migrations.slice(0, 3).join(", ")}`,
    );
  return points;
}

function domainPoints(
  domain: ProjectDomain,
  project: ProjectModel,
  findings: readonly Finding[],
  integrations: SemanticIntegration[],
): NonNullable<Proposal["points"]> {
  const points: NonNullable<Proposal["points"]> = [];
  const add = (key: string, text: string): void => {
    if (text) points.push({ id: `${domain.id}:${key}`, text });
  };
  const controllers = domain.controllers
    .map((id) => project.components.find((component) => component.id === id))
    .filter((item) => item !== undefined);
  const routes = findings.filter(
    (finding) =>
      finding.kind === "application.route" &&
      controllers.some(
        (controller) =>
          controller.name === stringData(finding, "controller") &&
          controller.evidence.some((evidence) =>
            finding.evidence.some((route) => route.file === evidence.file),
          ),
      ),
  );
  if (routes.length)
    add(
      "entry",
      `Explain entry points and caller expectations: ${routes
        .slice(0, 3)
        .map((route) =>
          `${stringData(route, "verb") ?? "ROUTE"} ${stringData(route, "path") ?? ""}`.trim(),
        )
        .join(", ")}`,
    );
  const handoffs = project.relationships
    .filter(
      (relationship) =>
        relationship.kind === "CONTROLLER_SERVICE" &&
        domain.controllers.includes(relationship.from) &&
        domain.services.includes(relationship.to),
    )
    .slice(0, 2)
    .map(
      (relationship) =>
        `${componentName(project, relationship.from)} → ${componentName(project, relationship.to)}`,
    );
  if (handoffs.length)
    add(
      "handoff",
      `Explain controller-to-service responsibilities: ${handoffs.join(", ")}`,
    );
  else if (domain.services.length)
    add(
      "services",
      `Explain service responsibilities: ${domain.services
        .slice(0, 2)
        .map((id) => componentName(project, id))
        .join(", ")}`,
    );
  if (domain.entities.length)
    add(
      "entities",
      `Explain persistence and data ownership: ${domain.entities
        .slice(0, 3)
        .map((id) => componentName(project, id))
        .join(", ")}`,
    );
  const providers = domain.integrations
    .map((id) =>
      integrations.find(
        (integration) => `integration:${integration.id}` === id,
      ),
    )
    .filter((item): item is SemanticIntegration => item !== undefined)
    .map(integrationLabel);
  if (providers.length)
    add(
      "integrations",
      `External interactions to explain: ${providers.join(", ")}`,
    );
  const jobs = findings.filter((finding) => domain.jobs.includes(finding.id));
  if (jobs.length)
    add(
      "jobs",
      `Scheduled work: ${jobs
        .slice(0, 3)
        .map((job) => stringData(job, "name") ?? job.id)
        .join(", ")}`,
    );
  return points;
}

function flowPoints(
  flow: CandidateFlow,
  project: ProjectModel,
  findings: readonly Finding[],
  integrations: SemanticIntegration[],
): NonNullable<Proposal["points"]> {
  const points: NonNullable<Proposal["points"]> = [];
  const add = (key: string, text: string): void => {
    if (text) points.push({ id: `${flow.id}:${key}`, text });
  };
  if (flow.entryPoints.length && !flow.jobIds.length)
    add(
      "entry",
      `Explain entry points and caller expectations: ${flow.entryPoints.slice(0, 3).join(", ")}`,
    );
  if (
    !flow.jobIds.length &&
    flow.entryPoints.some((entry) => /recover|retry|reconcile/iu.test(entry))
  )
    add(
      "recovery",
      "Explain the detected recovery entry point, safe rerun conditions, and failure handling",
    );
  if (flow.entryPoints.some((entry) => /callback|webhook/iu.test(entry)))
    add(
      "callback",
      "Explain callback validation, duplicate delivery, and failed processing behavior",
    );
  const services = flow.componentIds
    .map((id) => project.components.find((component) => component.id === id))
    .filter(
      (component) =>
        component?.kind === "SERVICE" && /Service$/u.test(component.name),
    )
    .slice(0, 3)
    .map((component) => component!.name);
  if (services.length)
    add(
      "services",
      `Explain service handoffs and responsibilities through ${services.join(", ")}`,
    );
  if (flow.entityIds.length)
    add(
      "entities",
      `Explain persistence and data changes affecting ${flow.entityIds
        .slice(0, 3)
        .map((id) => componentName(project, id))
        .join(", ")}`,
    );
  const providers = flow.integrationIds
    .map((id) =>
      integrations.find(
        (integration) => `integration:${integration.id}` === id,
      ),
    )
    .filter((item): item is SemanticIntegration => item !== undefined)
    .map(integrationLabel);
  if (providers.length)
    add(
      "integrations",
      `Explain provider interactions and failure handling through ${providers.join(", ")}`,
    );
  if (flow.jobIds.length)
    points.push(
      ...jobPoints(
        findings.filter((finding) =>
          flow.sourceFindingIds.includes(finding.id),
        ),
        flow.id,
      ),
    );
  return points;
}

function integrationPoints(
  integration: SemanticIntegration,
  provider: string,
  domain?: ProjectDomain,
): NonNullable<Proposal["points"]> {
  const points: NonNullable<Proposal["points"]> = [];
  const add = (key: string, text: string): void => {
    if (text) points.push({ id: `integration:${integration.id}:${key}`, text });
  };
  const callSites = integration.evidence
    .filter((evidence) => evidence.file !== "package.json")
    .slice(0, 2)
    .map(
      (evidence) =>
        `${evidence.file}${evidence.line ? `:${evidence.line}` : ""}`,
    );
  if (callSites.length)
    add("calls", `${provider} call sites: ${callSites.join(", ")}`);
  if (integration.knownOperations.length)
    add(
      "operations",
      `Detected operations: ${[...new Set(integration.knownOperations)].join(", ")}`,
    );
  if (integration.configuration.length)
    add(
      "configuration",
      `Configuration keys to locate: ${integration.configuration.slice(0, 3).join(", ")}`,
    );
  if (integration.authenticationEvidence.length)
    add(
      "authentication",
      `Authentication setup at ${integration.authenticationEvidence[0]!.file}`,
    );
  if (domain) add("domain", `Related domain: ${domain.name}`);
  add(
    "failure",
    "Failure and recovery behavior to confirm with the Current Owner",
  );
  return points;
}

function jobPoints(
  jobs: readonly Finding[],
  prefix = "scheduled-jobs",
): NonNullable<Proposal["points"]> {
  const points: NonNullable<Proposal["points"]> = [];
  for (const job of jobs.slice(0, 3)) {
    const name = stringData(job, "name") ?? job.id;
    const schedule =
      job.data && typeof job.data === "object" && "schedule" in job.data
        ? job.data.schedule
        : undefined;
    points.push({
      id: `${prefix}:${job.id}:handler`,
      text: `Handler and purpose to explain: ${name}`,
    });
    if (typeof schedule === "string" || typeof schedule === "number")
      points.push({
        id: `${prefix}:${job.id}:schedule`,
        text: `Detected schedule: ${schedule}`,
      });
  }
  points.push({
    id: `${prefix}:recovery`,
    text: "Missed-run and safe rerun behavior to confirm",
  });
  return points;
}

function humanizeJob(job: Finding): string {
  const method =
    (stringData(job, "name") ?? job.id).split(".").at(-1) ?? job.id;
  return method.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase();
}

function integrationLabel(integration: SemanticIntegration): string {
  const owner = integration.findings
    .map((finding) => stringData(finding, "owner"))
    .find((value) => providerFromName(value));
  const candidate = providerFromName(owner);
  if (
    candidate &&
    integration.provider
      .toLowerCase()
      .split(".")
      .includes(candidate.toLowerCase())
  )
    return candidate;
  return integration.provider;
}

function componentName(project: ProjectModel, id: string): string {
  return (
    project.components.find((component) => component.id === id)?.name ?? id
  );
}

function stringData(finding: Finding, key: string): string | undefined {
  const value = finding.data;
  if (typeof value !== "object" || value === null || !(key in value))
    return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function sourceFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) =>
    finding.evidence.some((evidence) => evidence.file !== "package.json"),
  );
}

function contextRank(section: string, kind: string): number {
  const preferred: Record<string, string[]> = {
    "System & Architecture": [
      "application.entry-point",
      "application.module",
      "application.controller",
      "database.configuration",
      "database",
      "integration",
      "scheduled-job",
      "messaging.consumer",
      "containerization",
      "ci.workflow",
    ],
    "Business Domains": [
      "application.module",
      "application.controller",
      "application.route",
      "application.service",
      "database.entity",
      "integration",
      "scheduled-job",
    ],
    "Critical Business Flows": [
      "application.route",
      "application.controller",
      "application.service",
      "integration",
      "database.entity",
      "scheduled-job",
    ],
    "Data & Persistence": [
      "database.configuration",
      "database.entity",
      "database",
    ],
    "External Services": ["integration"],
    "Async Processing & Scheduled Jobs": [
      "scheduled-job",
      "messaging.consumer",
    ],
  };
  const order = preferred[section] ?? [];
  const index = order.indexOf(kind);
  return index < 0 ? order.length : index;
}
