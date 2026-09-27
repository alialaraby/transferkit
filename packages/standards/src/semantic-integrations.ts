import type { Evidence, Finding } from "@transferkit/core";

export interface SemanticIntegration {
  id: string;
  provider: string;
  identity: "OBSERVED" | "INFERRED" | "UNKNOWN";
  findings: Finding[];
  evidence: Evidence[];
  callSites: string[];
  endpoints: string[];
  configuration: string[];
  relatedModules: string[];
  knownOperations: string[];
  authenticationEvidence: Evidence[];
}

function value(finding: Finding, key: string): string | undefined {
  const data = finding.data;
  if (typeof data !== "object" || data === null || !(key in data))
    return undefined;
  const item = (data as Record<string, unknown>)[key];
  return typeof item === "string" && item.trim() ? item : undefined;
}

function identity(finding: Finding): {
  key: string;
  provider: string;
  confidence: SemanticIntegration["identity"];
} {
  const service = value(finding, "service");
  if (
    service &&
    !/^(axios|fetch|httpservice|nestjs httpservice)$/iu.test(service)
  )
    return {
      key: service.toLowerCase(),
      provider: service,
      confidence: "OBSERVED",
    };
  const endpoint = value(finding, "endpoint");
  if (endpoint) {
    try {
      const host = new URL(endpoint).hostname;
      if (host)
        return {
          key: host.toLowerCase(),
          provider: host,
          confidence: "OBSERVED",
        };
    } catch {
      /* A dynamic URL is not provider identity. */
    }
  }
  const key = value(finding, "configKey");
  const match = key?.match(
    /^([A-Z][A-Z0-9]+)_(?:BASE_?URL|API_?URL|ENDPOINT|HOST)$/u,
  );
  if (match?.[1] && !["API", "HTTP", "EXTERNAL", "SERVICE"].includes(match[1]))
    return {
      key: match[1].toLowerCase(),
      provider: match[1],
      confidence: "INFERRED",
    };
  const owner = value(finding, "owner");
  const ownerMatch = owner?.match(
    /^([A-Z][A-Za-z0-9]+?)(?:Api|Http|Client|Integration)Service$/u,
  );
  if (ownerMatch?.[1])
    return {
      key: ownerMatch[1].toLowerCase(),
      provider: ownerMatch[1],
      confidence: "INFERRED",
    };
  return {
    key: `unknown:${finding.evidence[0]?.file ?? finding.id}`,
    provider: "Unknown HTTP Integration",
    confidence: "UNKNOWN",
  };
}

export function discoverSemanticIntegrations(
  findings: readonly Finding[],
): SemanticIntegration[] {
  const groups = new Map<string, SemanticIntegration>();
  for (const finding of findings.filter(({ kind }) => kind === "integration")) {
    const named = identity(finding);
    const callSite = finding.evidence[0];
    const group = groups.get(named.key) ?? {
      id: encodeURIComponent(named.key),
      provider: named.provider,
      identity: named.confidence,
      findings: [],
      evidence: [],
      callSites: [],
      endpoints: [],
      configuration: [],
      relatedModules: [],
      knownOperations: [],
      authenticationEvidence: [],
    };
    group.findings.push(finding);
    group.evidence.push(...finding.evidence);
    if (callSite)
      group.callSites.push(
        `${callSite.file}${callSite.line ? `:${callSite.line}` : ""}`,
      );
    const endpoint = value(finding, "endpoint");
    if (endpoint) group.endpoints.push(endpoint);
    const config = value(finding, "configKey");
    if (config) group.configuration.push(config);
    const authConfig = value(finding, "authConfigKey");
    if (authConfig) group.configuration.push(authConfig);
    const owner = value(finding, "owner");
    if (owner) {
      group.relatedModules.push(owner);
      for (const module of findings.filter(
        ({ kind }) => kind === "application.module",
      )) {
        const providers = value(module, "providers") ?? "";
        const controllers = value(module, "controllers") ?? "";
        const moduleName = value(module, "name");
        if (
          moduleName &&
          [...providers.split(","), ...controllers.split(",")].some(
            (item) => item.trim() === owner,
          )
        )
          group.relatedModules.push(moduleName);
      }
    }
    const operation = value(finding, "operation");
    if (operation) group.knownOperations.push(operation);
    if (
      authConfig ||
      (config && /(TOKEN|KEY|SECRET|AUTH|CREDENTIAL)/iu.test(config))
    )
      group.authenticationEvidence.push(...finding.evidence);
    groups.set(named.key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    callSites: [...new Set(group.callSites)],
    endpoints: [...new Set(group.endpoints)],
    configuration: [...new Set(group.configuration)],
    relatedModules: [...new Set(group.relatedModules)],
    knownOperations: [...new Set(group.knownOperations)],
    evidence: [
      ...new Map(
        group.evidence.map((item) => [`${item.file}:${item.line ?? ""}`, item]),
      ).values(),
    ],
    authenticationEvidence: [
      ...new Map(
        group.authenticationEvidence.map((item) => [
          `${item.file}:${item.line ?? ""}`,
          item,
        ]),
      ).values(),
    ],
  }));
}
