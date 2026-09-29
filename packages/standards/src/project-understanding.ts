import type {
  CandidateFlow,
  ComponentRelationship,
  Evidence,
  Finding,
  OperationalCapability,
  ProjectComponent,
  ProjectDomain,
  ProjectModel,
} from "@transferkit/core";
import { discoverSemanticIntegrations } from "./semantic-integrations.js";

type NamedFinding = Finding<Record<string, unknown>>;
const generic = new Set([
  "app",
  "config",
  "configuration",
  "typeorm",
  "schedule",
  "http",
  "common",
  "shared",
  "core",
  "database",
  "data",
  "health",
  "internaltest",
  "internal-test",
  "admin",
  "monitoring",
  "metrics",
]);

export function understandProject(findings: readonly Finding[]): ProjectModel {
  const named = findings as readonly NamedFinding[];
  const relevant = named.filter((finding) =>
    [
      "application.module",
      "application.controller",
      "application.service",
      "database.entity",
      "scheduled-job",
    ].includes(finding.kind),
  );
  const components: ProjectComponent[] = relevant.map((finding) => ({
    id: finding.id,
    name: componentName(finding),
    kind: componentKind(finding.kind),
    evidence: sourceEvidence(finding.evidence),
  }));
  const integrations = discoverSemanticIntegrations(findings);
  for (const integration of integrations) {
    if (
      integration.identity === "UNKNOWN" ||
      sourceEvidence(integration.evidence).length === 0
    )
      continue;
    components.push({
      id: `integration:${integration.id}`,
      name: integration.provider,
      kind: "INTEGRATION",
      evidence: sourceEvidence(integration.evidence),
    });
  }
  const byName = new Map<string, ProjectComponent[]>();
  for (const component of components)
    byName.set(component.name, [
      ...(byName.get(component.name) ?? []),
      component,
    ]);
  const unique = (name: string): ProjectComponent | undefined =>
    byName.get(name)?.length === 1 ? byName.get(name)![0] : undefined;

  const domainMap = new Map<string, ProjectDomain>();
  const ensure = (name: string, evidence: Evidence[]): ProjectDomain => {
    const key = domainKey(name);
    let domain = domainMap.get(key);
    if (!domain) {
      domain = {
        id: `domain:${key}`,
        name: title(key),
        modules: [],
        controllers: [],
        services: [],
        entities: [],
        integrations: [],
        jobs: [],
        evidence: [],
      };
      domainMap.set(key, domain);
    }
    domain.evidence = mergeEvidence(domain.evidence, evidence);
    return domain;
  };
  const assign = (domain: ProjectDomain, component: ProjectComponent): void => {
    const field = (
      {
        MODULE: "modules",
        CONTROLLER: "controllers",
        SERVICE: "services",
        ENTITY: "entities",
        INTEGRATION: "integrations",
        JOB: "jobs",
      } as const
    )[component.kind];
    if (!domain[field].includes(component.id)) domain[field].push(component.id);
    domain.evidence = mergeEvidence(domain.evidence, component.evidence);
  };
  const moduleFindings = named.filter(
    (finding) => finding.kind === "application.module",
  );
  for (const module of moduleFindings) {
    const name = data(module, "name")?.replace(/Module$/u, "");
    if (!name || !businessCandidate(name, module.evidence, named)) continue;
    const domain = ensure(name, sourceEvidence(module.evidence));
    const component = components.find((item) => item.id === module.id);
    if (component) assign(domain, component);
    for (const member of [
      ...csv(data(module, "controllers")),
      ...csv(data(module, "providers")),
    ]) {
      const found = unique(member);
      if (found) assign(domain, found);
    }
  }
  const componentDirectory = (
    component: ProjectComponent,
  ): string | undefined => {
    const file = component.evidence[0]?.file ?? "";
    const parts = file.split("/");
    const start = parts.indexOf("src");
    const segment = start >= 0 ? parts[start + 1] : undefined;
    return segment &&
      segment !== parts.at(-1) &&
      businessCandidate(segment, component.evidence, named)
      ? segment
      : undefined;
  };
  const directoryGroups = new Map<string, ProjectComponent[]>();
  for (const component of components.filter(
    (item) => item.kind !== "INTEGRATION",
  )) {
    const directory = componentDirectory(component);
    if (directory)
      directoryGroups.set(domainKey(directory), [
        ...(directoryGroups.get(domainKey(directory)) ?? []),
        component,
      ]);
  }
  for (const [key, group] of directoryGroups) {
    if (group.length < 2 && !domainMap.has(key)) continue;
    const domain = ensure(
      title(key),
      group.flatMap((item) => item.evidence),
    );
    for (const component of group) assign(domain, component);
  }
  const prefixGroups = new Map<string, ProjectComponent[]>();
  for (const component of components.filter(
    (item) => item.kind !== "INTEGRATION",
  )) {
    if (componentDirectory(component)) continue;
    const prefix = component.name.replace(
      /(?:Controller|Service|Client|Jobs?|Entity|Module)(?:\..*)?$/u,
      "",
    );
    if (prefix && businessCandidate(prefix, component.evidence, named))
      prefixGroups.set(domainKey(prefix), [
        ...(prefixGroups.get(domainKey(prefix)) ?? []),
        component,
      ]);
  }
  for (const [key, group] of prefixGroups) {
    if (group.length < 2 && !domainMap.has(key)) continue;
    const domain = ensure(
      title(key),
      group.flatMap((item) => item.evidence),
    );
    for (const component of group) assign(domain, component);
  }

  const relationships: ComponentRelationship[] = [];
  const relate = (
    kind: ComponentRelationship["kind"],
    from: ProjectComponent | undefined,
    to: ProjectComponent | undefined,
    evidence: Evidence[],
  ): void => {
    if (!from || !to || from.id === to.id) return;
    const id = `${kind}:${from.id}:${to.id}`;
    if (!relationships.some((item) => item.id === id))
      relationships.push({
        id,
        kind,
        from: from.id,
        to: to.id,
        evidence: sourceEvidence(evidence),
      });
  };
  for (const module of moduleFindings) {
    const source = components.find((component) => component.id === module.id);
    for (const imported of csv(data(module, "imports")))
      relate("MODULE_IMPORT", source, unique(imported), module.evidence);
    for (const provider of csv(data(module, "providers")))
      relate("MODULE_PROVIDER", source, unique(provider), module.evidence);
    for (const controller of csv(data(module, "controllers")))
      relate("MODULE_CONTROLLER", source, unique(controller), module.evidence);
  }
  const integrationOwners = new Map<string, ProjectComponent[]>();
  for (const integration of integrations) {
    const component = components.find(
      (item) => item.id === `integration:${integration.id}`,
    );
    if (!component) continue;
    for (const finding of integration.findings) {
      const owner = data(finding as NamedFinding, "owner");
      if (owner)
        integrationOwners.set(owner, [
          ...(integrationOwners.get(owner) ?? []),
          component,
        ]);
    }
  }
  for (const dependency of named.filter(
    (finding) => finding.kind === "application.dependency",
  )) {
    const sourceName = data(dependency, "source");
    const targetName = data(dependency, "target");
    if (!sourceName || !targetName) continue;
    const candidates = byName.get(sourceName) ?? [];
    const source =
      candidates.find(
        (item) =>
          item.kind === "JOB" &&
          item.evidence.some((evidence) =>
            dependency.evidence.some((origin) => origin.file === evidence.file),
          ),
      ) ?? unique(sourceName);
    const target = unique(targetName);
    if (!source) continue;
    if (source.kind === "CONTROLLER" && target?.kind === "SERVICE")
      relate("CONTROLLER_SERVICE", source, target, dependency.evidence);
    if (
      source.kind === "SERVICE" &&
      target?.kind === "ENTITY" &&
      data(dependency, "dependencyKind") === "repository-entity"
    )
      relate("SERVICE_ENTITY", source, target, dependency.evidence);
    const integrationsForOwner = [
      ...new Map(
        (integrationOwners.get(targetName) ?? []).map((item) => [
          item.id,
          item,
        ]),
      ).values(),
    ];
    if (source.kind === "SERVICE" && integrationsForOwner.length === 1)
      relate(
        "SERVICE_INTEGRATION",
        source,
        integrationsForOwner[0],
        mergeEvidence(dependency.evidence, integrationsForOwner[0]!.evidence),
      );
    if (source.kind === "SERVICE" && target?.kind === "SERVICE")
      relate("SERVICE_SERVICE", source, target, dependency.evidence);
    if (source.kind === "JOB" && target?.kind === "SERVICE")
      relate("JOB_SERVICE", source, target, dependency.evidence);
  }
  for (const domain of domainMap.values()) {
    for (const component of components.filter(
      (item) => item.kind === "INTEGRATION",
    )) {
      const owner = [...integrationOwners.entries()].find(([, values]) =>
        values.some((integration) => integration.id === component.id),
      )?.[0];
      const ownerComponent = owner ? unique(owner) : undefined;
      const sameDirectory = component.evidence.some((item) =>
        item.file.split("/").some((part) => slug(part) === domain.id.slice(7)),
      );
      const linked = relationships.some(
        (relation) =>
          relation.kind === "SERVICE_INTEGRATION" &&
          relation.to === component.id &&
          domain.services.includes(relation.from),
      );
      if (
        sameDirectory ||
        linked ||
        (ownerComponent && domain.services.includes(ownerComponent.id))
      )
        assign(domain, component);
    }
    for (const relation of relationships) {
      if (
        relation.kind === "SERVICE_ENTITY" &&
        domain.services.includes(relation.from)
      ) {
        const entity = components.find((item) => item.id === relation.to);
        if (entity) assign(domain, entity);
      }
      if (
        relation.kind === "JOB_SERVICE" &&
        domain.services.includes(relation.to)
      ) {
        const job = components.find((item) => item.id === relation.from);
        if (job) assign(domain, job);
      }
    }
  }
  const domains = [...domainMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const candidateFlows = buildFlows(domains, components, relationships, named);
  const operationalCapabilities = buildOperational(findings, components);
  return {
    domains,
    components,
    relationships,
    candidateFlows,
    operationalCapabilities,
  };
}

function buildFlows(
  domains: ProjectDomain[],
  components: ProjectComponent[],
  relationships: ComponentRelationship[],
  findings: readonly NamedFinding[],
): CandidateFlow[] {
  const flows: CandidateFlow[] = [];
  const byId = new Map(
    components.map((component) => [component.id, component]),
  );
  const outgoing = (id: string, kinds: ComponentRelationship["kind"][]) =>
    relationships.filter(
      (relation) => relation.from === id && kinds.includes(relation.kind),
    );
  const compose = (
    source: NamedFinding,
    start: ProjectComponent,
    title: string,
    entry: string,
    key: string,
  ): void => {
    const seen = new Set<string>([start.id]);
    const steps: CandidateFlow["steps"] = [
      { componentId: start.id, evidence: sourceEvidence(source.evidence) },
    ];
    const visit = (id: string, depth: number): void => {
      if (depth > 2) return;
      const kinds: ComponentRelationship["kind"][] =
        depth === 0
          ? ["CONTROLLER_SERVICE", "JOB_SERVICE"]
          : ["SERVICE_SERVICE", "SERVICE_ENTITY", "SERVICE_INTEGRATION"];
      for (const relation of outgoing(id, kinds)) {
        if (seen.has(relation.to) || !relation.evidence.length) continue;
        const component = byId.get(relation.to);
        if (!component) continue;
        seen.add(relation.to);
        steps.push({ componentId: component.id, evidence: relation.evidence });
        if (component.kind === "SERVICE") visit(component.id, depth + 1);
      }
    };
    visit(start.id, 0);
    if (steps.length < 3) return;
    const ids = steps.map((step) => step.componentId);
    const domainIds = domains
      .filter((domain) =>
        [
          domain.controllers,
          domain.services,
          domain.entities,
          domain.integrations,
          domain.jobs,
        ].some((members) => members.some((id) => seen.has(id))),
      )
      .map((domain) => domain.id);
    flows.push({
      id: `flow:${slug(key)}`,
      title,
      domainIds,
      componentIds: ids,
      steps,
      entryPoints: [entry],
      integrationIds: ids.filter((id) => byId.get(id)?.kind === "INTEGRATION"),
      entityIds: ids.filter((id) => byId.get(id)?.kind === "ENTITY"),
      jobIds: ids.filter((id) => byId.get(id)?.kind === "JOB"),
      confidence: "CANDIDATE",
      sourceFindingIds: [source.id],
      evidence: mergeEvidence(
        sourceEvidence(source.evidence),
        ...steps.map((step) => step.evidence),
      ),
    });
  };
  for (const route of findings.filter(
    (finding) => finding.kind === "application.route",
  )) {
    const controller = components.find(
      (component) =>
        component.kind === "CONTROLLER" &&
        component.name === data(route, "controller") &&
        component.evidence.some((evidence) =>
          route.evidence.some((item) => item.file === evidence.file),
        ),
    );
    if (
      !controller ||
      !domains.some((domain) => domain.controllers.includes(controller.id))
    )
      continue;
    const method = data(route, "method") ?? "";
    const controllerDomains = domains.filter((item) =>
      item.controllers.includes(controller.id),
    );
    const domain =
      controllerDomains.find((item) => item.name !== "Module") ??
      controllerDomains[0]!;
    compose(
      route,
      controller,
      flowTitle(domain.name, method),
      routeEntry(route),
      route.id,
    );
  }
  for (const job of findings.filter(
    (finding) => finding.kind === "scheduled-job",
  )) {
    const component = byId.get(job.id);
    if (!component) continue;
    const name = data(job, "name") ?? job.id;
    compose(
      job,
      component,
      `${name
        .split(".")
        .at(-1)!
        .replace(/([a-z])([A-Z])/gu, "$1 $2")
        .toLowerCase()} scheduled processing`,
      name,
      job.id,
    );
  }
  // A route set is still useful when static dependencies cannot form a connected path.
  for (const domain of domains) {
    if (flows.some((flow) => flow.domainIds.includes(domain.id))) continue;
    const routes = findings.filter(
      (finding) =>
        finding.kind === "application.route" &&
        domain.controllers.some(
          (id) => byId.get(id)?.name === data(finding, "controller"),
        ),
    );
    if (routes.length < 2) continue;
    flows.push({
      id: `flow:${domain.id.slice(7)}:routes`,
      title: `${domain.name} lifecycle`,
      domainIds: [domain.id],
      componentIds: [...domain.controllers],
      steps: domain.controllers.map((id) => ({
        componentId: id,
        evidence: byId.get(id)?.evidence ?? [],
      })),
      entryPoints: routes.map(routeEntry),
      integrationIds: [],
      entityIds: [],
      jobIds: [],
      confidence: "CANDIDATE",
      sourceFindingIds: routes.map((route) => route.id),
      evidence: mergeEvidence(
        ...routes.map((route) => sourceEvidence(route.evidence)),
      ),
    });
  }
  return flows;
}

function routeEntry(route: NamedFinding): string {
  const verb = data(route, "verb") ?? "ROUTE";
  const path = data(route, "path");
  return path
    ? `${verb} ${path}`
    : `${verb} ${data(route, "controller") ?? "Controller"}.${data(route, "method") ?? "method"} (path unresolved)`;
}

function flowTitle(domain: string, method: string): string {
  const action = method.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase();
  if (/callback|webhook/u.test(action)) return `${domain} callback handling`;
  if (/recover|retry|reconcile/u.test(action))
    return `${domain} recovery and reconciliation`;
  if (/^create /u.test(action)) return `${domain} creation`;
  if (/^get |^find |^list /u.test(action)) return `${domain} lookup`;
  return `${domain} ${action || "request"}`;
}

function buildOperational(
  findings: readonly Finding[],
  components: ProjectComponent[],
): OperationalCapability[] {
  const definitions: [OperationalCapability["kind"], string[]][] = [
    ["SCHEDULED_JOBS", ["scheduled-job"]],
    ["MESSAGING", ["messaging.consumer"]],
    ["PERSISTENCE", ["database.entity", "database.configuration"]],
    ["MIGRATIONS", ["database.migration"]],
    ["DEPLOYMENT", ["ci.workflow", "containerization"]],
    [
      "RUNTIME_CONFIGURATION",
      ["environment.template", "environment.variable", "configuration"],
    ],
    ["EXTERNAL_SERVICES", ["integration"]],
    ["SECURITY", ["security.guard"]],
  ];
  const result = definitions.flatMap(([kind, kinds]) => {
    const source = findings.filter(
      (finding) =>
        kinds.includes(finding.kind) &&
        sourceEvidence(finding.evidence).length > 0,
    );
    return source.length
      ? [
          {
            id: `operation:${kind.toLowerCase()}`,
            kind,
            componentIds: components
              .filter((item) =>
                source.some((finding) => finding.id === item.id),
              )
              .map((item) => item.id),
            evidence: mergeEvidence(
              ...source.map((finding) => sourceEvidence(finding.evidence)),
            ),
          },
        ]
      : [];
  });
  const admin = findings.filter(
    (finding) =>
      (finding.kind === "application.route" &&
        /admin|recover|retry|repair/iu.test(
          `${data(finding as NamedFinding, "path")} ${data(finding as NamedFinding, "method")}`,
        )) ||
      (finding.kind === "application.module" &&
        finding.evidence.some((item) => /(?:^|\/)admin\//iu.test(item.file))),
  );
  if (admin.length)
    result.push({
      id: "operation:admin-endpoints",
      kind: "ADMIN_ENDPOINTS",
      componentIds: components
        .filter((component) =>
          component.evidence.some((item) =>
            /(?:^|\/)admin\//iu.test(item.file),
          ),
        )
        .map((component) => component.id),
      evidence: mergeEvidence(
        ...admin.map((finding) => sourceEvidence(finding.evidence)),
      ),
    });
  return result;
}

function componentKind(kind: string): ProjectComponent["kind"] {
  return (
    {
      "application.module": "MODULE",
      "application.controller": "CONTROLLER",
      "application.service": "SERVICE",
      "database.entity": "ENTITY",
      "scheduled-job": "JOB",
    } as Record<string, ProjectComponent["kind"]>
  )[kind]!;
}
function componentName(finding: NamedFinding): string {
  const name = data(finding, "name") ?? finding.id;
  return finding.kind === "scheduled-job" ? name.split(".")[0]! : name;
}
function data(finding: NamedFinding, key: string): string | undefined {
  const value = finding.data[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z_$][\w$]*$/u.test(item));
}
function slug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
function domainKey(value: string): string {
  const key = slug(value);
  return key.endsWith("ies")
    ? `${key.slice(0, -3)}y`
    : key.endsWith("s") && !key.endsWith("ss")
      ? key.slice(0, -1)
      : key;
}
function businessCandidate(
  name: string,
  evidence: readonly Evidence[],
  findings: readonly NamedFinding[],
): boolean {
  const key = domainKey(name);
  if (generic.has(key) || /(?:health|internal-test|metric|admin)$/u.test(key))
    return false;
  if (evidence.some((item) => /(?:^|\/)admin\//iu.test(item.file)))
    return false;
  if (/(?:dashboard|report)$/u.test(key)) {
    const folder = evidence[0]?.file.split("/").slice(0, -1).join("/");
    return Boolean(
      folder &&
      findings.some(
        (finding) =>
          finding.kind === "database.entity" &&
          finding.evidence.some((item) => item.file.startsWith(`${folder}/`)),
      ),
    );
  }
  return true;
}
function title(value: string): string {
  return value
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
function sourceEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter((item) => item.file !== "package.json");
}
function mergeEvidence(...groups: readonly Evidence[][]): Evidence[] {
  return [
    ...new Map(
      groups.flat().map((item) => [`${item.file}:${item.line ?? ""}`, item]),
    ).values(),
  ];
}
