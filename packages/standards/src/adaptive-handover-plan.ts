import {
  createHandoverPlan,
  type Finding,
  type BusinessFlow,
  type BusinessFlowField,
  type HandoverPlan,
  type HandoverPlanInput,
  type HandoverRequirement,
  type RequirementPriority,
} from "@transferkit/core";

import { handoverStandardV2 } from "./handover-standard-v2.js";
import { discoverSemanticIntegrations } from "./semantic-integrations.js";

export interface CustomHandoverTopic {
  id: string;
  title: string;
  priority: RequirementPriority;
}

export interface AdaptiveHandoverInput extends HandoverPlanInput {
  findings: readonly Finding[];
  customTopics?: readonly CustomHandoverTopic[];
  flows?: readonly BusinessFlow[];
}

interface Subject {
  id: string;
  title: string;
  findings: Finding[];
}

interface Topic {
  key: string;
  title: string;
  priority: RequirementPriority;
  observed?: (finding: Finding) => string | undefined;
  legacyField?: string;
}

const messagingTopics: readonly Topic[] = [
  {
    key: "consumers",
    title: "Consumers and message entry points",
    priority: "recommended",
    observed: (finding) =>
      finding.kind === "messaging.consumer"
        ? dataString(finding, "name")
        : undefined,
  },
  {
    key: "flows",
    title: "Message flows and business purpose",
    priority: "critical",
  },
  {
    key: "retries-dlq",
    title: "Retry and dead-letter behavior",
    priority: "critical",
    legacyField: "failureBehavior",
  },
  {
    key: "recovery",
    title: "Replay and recovery procedure",
    priority: "critical",
    legacyField: "recoveryProcedure",
  },
  {
    key: "owner",
    title: "Operational owner",
    priority: "critical",
    legacyField: "operationalOwner",
  },
];
const jobTopics: readonly Topic[] = [
  {
    key: "cadence",
    title: "Job cadence",
    priority: "recommended",
    observed: (finding) => {
      const value = dataValue(finding, "schedule");
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : undefined;
    },
  },
  {
    key: "purpose",
    title: "Job purpose and business impact",
    priority: "critical",
  },
  {
    key: "concurrency",
    title: "Overlap and concurrency",
    priority: "recommended",
    legacyField: "concurrencyConcerns",
  },
  {
    key: "idempotency",
    title: "Idempotency and safe rerun",
    priority: "critical",
  },
  {
    key: "failure",
    title: "Failure behavior",
    priority: "critical",
    legacyField: "failureBehavior",
  },
  {
    key: "recovery",
    title: "Manual execution and recovery",
    priority: "critical",
    legacyField: "recoveryProcedure",
  },
  {
    key: "owner",
    title: "Operational owner",
    priority: "critical",
    legacyField: "operationalOwner",
  },
];
const integrationTopics: readonly Topic[] = [
  {
    key: "provider",
    title: "Provider or external system identity",
    priority: "recommended",
  },
  {
    key: "configuration",
    title: "Integration configuration",
    priority: "recommended",
    observed: (finding) => dataString(finding, "configKey"),
  },
  {
    key: "operations",
    title: "Known call operations",
    priority: "recommended",
    observed: (finding) => dataString(finding, "operation"),
  },
  {
    key: "endpoint",
    title: "Provider endpoint or SDK",
    priority: "recommended",
    observed: (finding) =>
      dataString(finding, "endpoint") ?? dataString(finding, "service"),
  },
  {
    key: "purpose",
    title: "Purpose and business importance",
    priority: "critical",
  },
  {
    key: "credentials",
    title: "Credentials and environment ownership",
    priority: "critical",
  },
  {
    key: "sandbox",
    title: "Sandbox access",
    priority: "recommended",
    legacyField: "sandboxAvailability",
  },
  {
    key: "failures",
    title: "Known failures",
    priority: "critical",
    legacyField: "failureBehavior",
  },
  {
    key: "recovery",
    title: "Manual recovery and operational procedure",
    priority: "critical",
  },
  {
    key: "contacts",
    title: "Provider and escalation contacts",
    priority: "critical",
    legacyField: "externalOwner",
  },
];
const dataTopics: readonly Topic[] = [
  {
    key: "technology",
    title: "Persistence technology",
    priority: "recommended",
    observed: (finding) => dataString(finding, "name"),
  },
  {
    key: "important-data",
    title: "Important data and business meaning",
    priority: "critical",
    legacyField: "criticalData",
  },
  {
    key: "migrations",
    title: "Migrations and dangerous operations",
    priority: "critical",
  },
  {
    key: "recovery",
    title: "Backup and recovery procedure",
    priority: "critical",
    legacyField: "dataRecovery",
  },
  {
    key: "owner",
    title: "Data owner",
    priority: "recommended",
    legacyField: "dataOwner",
  },
];

export function planAdaptiveHandover(
  input: AdaptiveHandoverInput,
): HandoverPlan {
  const integrations = discoverSemanticIntegrations(input.findings);
  const areas = handoverStandardV2.areas.map((area) => ({
    ...area,
    requirements: [...area.requirements],
  }));
  const contextAreas: Record<string, readonly string[]> = {
    technology: ["architecture", "local-development"],
    "application.entry-point": ["codebase-structure", "architecture"],
    "application.module": [
      "architecture",
      "business-domains",
      "codebase-structure",
    ],
    "application.controller": ["codebase-structure", "critical-business-flows"],
    "application.route": ["codebase-structure", "critical-business-flows"],
    "application.service": ["architecture", "business-domains"],
    "security.guard": ["authentication-authorization", "security"],
    "database.relationship": ["data-persistence"],
    "observability.signal": ["observability"],
    "database.entity": ["data-persistence"],
    "scheduled-job": ["scheduled-jobs", "operations"],
    "messaging.consumer": ["async-processing", "operations"],
    integration: ["external-integrations", "architecture"],
    language: ["architecture", "codebase-structure"],
    framework: ["architecture", "codebase-structure"],
    containerization: ["infrastructure", "deployment"],
    "ci.workflow": ["deployment"],
    "environment.variable": ["runtime-configuration"],
    "environment.template": ["runtime-configuration"],
    configuration: ["runtime-configuration"],
  };
  for (const area of areas) {
    const evidence = input.findings
      .filter(({ kind }) => contextAreas[kind]?.includes(area.id))
      .sort(
        (left, right) =>
          contextRank(area.id, left.kind) - contextRank(area.id, right.kind),
      )
      .flatMap((finding) => finding.evidence);
    if (evidence.length) {
      area.requirements = area.requirements.map((requirement) => ({
        ...requirement,
        contextEvidence: evidence,
      }));
    }
  }
  const observations = [...(input.observations ?? [])];
  const knowledgeLinks = [...(input.knowledgeLinks ?? [])];
  const inactive = [...(input.inactive ?? [])];
  const skipped = [...(input.skipped ?? [])];
  const groups: readonly [string, Subject[], readonly Topic[]][] = [
    [
      "async-processing",
      groupSimple(
        input.findings.filter(
          (finding) =>
            finding.kind === "messaging" ||
            finding.kind === "messaging.consumer",
        ),
        "Messaging",
      ),
      messagingTopics,
    ],
    [
      "scheduled-jobs",
      groupIndividual(
        input.findings.filter((finding) => finding.kind === "scheduled-job"),
      ),
      jobTopics,
    ],
    [
      "external-integrations",
      groupIntegrations(integrations),
      integrationTopics,
    ],
    [
      "data-persistence",
      groupSimple(
        input.findings.filter(
          (finding) =>
            finding.kind === "database" ||
            finding.kind === "database.entity" ||
            finding.kind === "database.configuration",
        ),
        "Database",
      ),
      dataTopics,
    ],
  ];
  for (const [areaId, subjects, topics] of groups) {
    const area = areas.find(({ id }) => id === areaId);
    if (!area) continue;
    if (subjects.length === 0) {
      inactive.push(...area.requirements.map(({ id }) => id));
      continue;
    }
    // The broad standard topic is replaced by evidence-specific requirements.
    area.requirements = [];
    for (const subject of subjects) {
      for (const topic of topics) {
        const id = `${areaId}.${subject.id}.${topic.key}`;
        const requirement: HandoverRequirement = {
          id,
          title: topic.title,
          priority: topic.priority,
          subject: subject.title,
          expectedSource:
            topic.observed ||
            (areaId === "external-integrations" && topic.key === "provider")
              ? "repository"
              : "human",
          completion: topic.observed ? "observed" : "confirmed-human",
          contextEvidence: subject.findings.flatMap(({ evidence }) => evidence),
        };
        area.requirements.push(requirement);
        if (areaId === "external-integrations" && topic.key === "provider") {
          const integration = integrations.find(({ id }) => id === subject.id);
          if (
            integration &&
            integration.identity !== "UNKNOWN" &&
            integration.evidence.length
          ) {
            observations.push({
              requirementId: id,
              classification: integration.identity,
              evidence: integration.evidence,
              value: integration.provider,
            });
          }
        }
        for (const finding of subject.findings) {
          const value = topic.observed?.(finding);
          if (value !== undefined && finding.evidence.length > 0) {
            observations.push({
              requirementId: id,
              classification: "OBSERVED",
              evidence: finding.evidence,
              value,
            });
          }
          if (topic.legacyField) {
            knowledgeLinks.push({
              requirementId: id,
              entityId: legacyEntityId(finding),
              field: topic.legacyField,
            });
          }
        }
      }
    }
  }
  for (const area of areas) {
    for (const requirement of area.requirements) {
      knowledgeLinks.push({
        requirementId: requirement.id,
        entityId: requirement.id,
        field: "content",
      });
    }
  }
  const flowArea = areas.find(({ id }) => id === "critical-business-flows");
  const confirmedFlows = (input.flows ?? []).filter(
    ({ status }) => status === "confirmed",
  );
  if (flowArea && confirmedFlows.length) {
    flowArea.requirements = [];
    for (const flow of confirmedFlows) {
      const handoverId = `critical-business-flows.${flow.id}.handover`;
      flowArea.requirements.push({
        id: handoverId,
        title: "Flow handover essentials",
        priority: "critical",
        subject: flow.name,
        completion: "confirmed-flow",
      });
      knowledgeLinks.push({
        requirementId: handoverId,
        entityId: `business-flow:${flow.id}`,
        field: "handover",
      });
      for (const [field, title, priority] of flowFields) {
        const id = `critical-business-flows.${flow.id}.${field}`;
        flowArea.requirements.push({
          id,
          title,
          priority,
          subject: flow.name,
          completion: "confirmed-human",
          contextEvidence:
            input.findings.find(({ id }) => id === flow.sourceFindingId)
              ?.evidence ?? [],
        });
        knowledgeLinks.push({
          requirementId: id,
          entityId: `business-flow:${flow.id}`,
          field,
        });
      }
    }
  }
  if (input.customTopics?.length) {
    knowledgeLinks.push(
      ...input.customTopics.map(({ id }) => ({
        requirementId: `custom-topics.${id}`,
        entityId: `custom-topics.${id}`,
        field: "content",
      })),
    );
    areas.push({
      id: "custom-topics",
      title: "Custom Topics",
      requirements: input.customTopics.map(({ id, title, priority }) => ({
        id: `custom-topics.${id}`,
        title,
        priority,
      })),
    });
  }
  for (const link of knowledgeLinks) {
    const entries = (input.knowledge ?? []).filter(
      ({ entityId, field }) =>
        entityId === link.entityId && field === link.field,
    );
    if (
      entries.some(({ status }) => status === "skipped") &&
      !entries.some(({ status, value }) => status !== "skipped" && value.trim())
    ) {
      skipped.push(link.requirementId);
    }
  }
  return createHandoverPlan(
    { areas },
    {
      ...input,
      integrations: integrations.map(
        ({
          id,
          provider,
          identity,
          endpoints,
          knownOperations,
          configuration,
          relatedModules,
          callSites,
          authenticationEvidence,
        }) => ({
          id,
          provider,
          identity,
          endpoints,
          operations: knownOperations,
          configuration,
          relatedModules,
          callSites,
          authenticationEvidence,
        }),
      ),
      knowledge: [
        ...(input.knowledge ?? []),
        ...confirmedFlows.flatMap((flow) => [
          ...Object.entries(flow.details).map(([field, value]) => ({
            entityId: `business-flow:${flow.id}`,
            field,
            value,
          })),
          ...(flowReady(flow, input.confirmed ?? [])
            ? [
                {
                  entityId: `business-flow:${flow.id}`,
                  field: "handover",
                  value: "Core flow details documented",
                },
              ]
            : []),
        ]),
      ],
      observations,
      knowledgeLinks,
      confirmed: [
        ...(input.confirmed ?? []),
        ...confirmedFlows
          .filter((flow) => flowReady(flow, input.confirmed ?? []))
          .map((flow) => `critical-business-flows.${flow.id}.handover`),
      ],
      inactive,
      skipped,
    },
  );
}

function contextRank(areaId: string, kind: string): number {
  const relevant: Record<string, readonly string[]> = {
    architecture: [
      "application.entry-point",
      "application.module",
      "application.service",
      "application.controller",
      "application.route",
      "integration",
      "framework",
      "language",
      "technology",
    ],
    "codebase-structure": [
      "application.entry-point",
      "application.module",
      "application.controller",
      "application.route",
      "framework",
      "language",
    ],
    "business-domains": ["application.module", "application.service"],
    "critical-business-flows": ["application.route", "application.controller"],
    "authentication-authorization": ["security.guard"],
    "data-persistence": [
      "database.relationship",
      "database.entity",
      "database.configuration",
      "database",
    ],
    observability: ["observability.signal"],
  };
  const order = relevant[areaId] ?? [];
  const index = order.indexOf(kind);
  return index < 0 ? order.length : index;
}

const requiredFlowFields: readonly BusinessFlowField[] = [
  "purpose",
  "entryPoint",
  "mainPath",
  "businessRules",
  "failurePaths",
  "retryRecovery",
];

function flowReady(flow: BusinessFlow, confirmed: readonly string[]): boolean {
  return requiredFlowFields.every(
    (field) =>
      Boolean(flow.details[field]?.trim()) &&
      confirmed.includes(`critical-business-flows.${flow.id}.${field}`),
  );
}

function groupSimple(findings: readonly Finding[], title: string): Subject[] {
  return findings.length
    ? [{ id: title.toLowerCase(), title, findings: [...findings] }]
    : [];
}

function groupIndividual(findings: readonly Finding[]): Subject[] {
  return findings.map((finding) => ({
    id: encodeURIComponent(finding.id),
    title: dataString(finding, "name") ?? finding.id,
    findings: [finding],
  }));
}

function groupIntegrations(
  integrations: ReturnType<typeof discoverSemanticIntegrations>,
): Subject[] {
  return integrations.map((integration) => ({
    id: integration.id,
    title: integration.provider,
    findings: integration.findings,
  }));
}

function dataValue(finding: Finding, key: string): unknown {
  return typeof finding.data === "object" &&
    finding.data !== null &&
    key in finding.data
    ? (finding.data as Record<string, unknown>)[key]
    : undefined;
}

function dataString(finding: Finding, key: string): string | undefined {
  const value = dataValue(finding, key);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function legacyEntityId(finding: Finding): string {
  if (finding.kind === "database") {
    const name = dataString(finding, "name");
    if (name) return `database:${name.toLowerCase()}`;
  }
  return finding.id;
}

const flowFields: readonly [BusinessFlowField, string, RequirementPriority][] =
  [
    ["purpose", "Purpose", "critical"],
    ["actors", "Actors", "recommended"],
    ["entryPoint", "Entry point", "critical"],
    ["mainPath", "Main path", "critical"],
    ["businessRules", "Important business rules", "critical"],
    ["dataChanges", "Important data changes", "recommended"],
    ["externalSideEffects", "External side effects", "recommended"],
    ["failurePaths", "Failure paths", "critical"],
    ["retryRecovery", "Retry and recovery", "critical"],
    ["manualOperations", "Manual operations", "recommended"],
    ["edgeCases", "Edge cases", "optional"],
    ["surprisingBehavior", "Surprising behavior", "optional"],
  ];

export function suggestBusinessFlows(
  findings: readonly Finding[],
): BusinessFlow[] {
  return findings
    .filter(
      ({ kind }) =>
        kind === "messaging.consumer" ||
        kind === "scheduled-job" ||
        kind === "application.route",
    )
    .map((finding) => ({
      id: `suggested:${encodeURIComponent(finding.id)}`,
      name:
        finding.kind === "application.route"
          ? `${dataString(finding, "verb") ?? "Route"} ${dataString(finding, "path") ?? ""}`.trim()
          : `Flow from ${dataString(finding, "name") ?? finding.id}`,
      origin: "suggested" as const,
      status: "suggested" as const,
      sourceFindingId: finding.id,
      startingPoints: flowStartingPoints(finding, findings),
      details: {},
    }));
}

function flowStartingPoints(
  finding: Finding,
  findings: readonly Finding[],
): string[] {
  const controller = dataString(finding, "controller");
  const owner = controller ?? dataString(finding, "name")?.split(".")[0];
  const points = [
    ...(controller ? [controller] : []),
    ...(dataString(finding, "method") ? [dataString(finding, "method")!] : []),
    ...(dataString(finding, "name") ? [dataString(finding, "name")!] : []),
  ];
  for (const module of findings.filter(
    ({ kind }) => kind === "application.module",
  )) {
    const controllers =
      dataString(module, "controllers")
        ?.split(",")
        .map((name) => name.trim()) ?? [];
    if (owner && controllers.includes(owner)) {
      points.push(dataString(module, "name") ?? "");
      points.push(
        ...(dataString(module, "providers")
          ?.split(",")
          .map((name) => name.trim()) ?? []),
      );
    }
  }
  return [...new Set(points.filter(Boolean))];
}
