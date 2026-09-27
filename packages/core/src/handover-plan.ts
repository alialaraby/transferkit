import type { Evidence, Finding, RequirementPriority } from "./index.js";
import type { KnowledgeEntry } from "./knowledge-gaps.js";

export type KnowledgeClassification =
  "OBSERVED" | "INFERRED" | "HUMAN" | "UNKNOWN";
export type HandoverApplicability =
  "applicable" | "inactive" | "not-applicable";
export type HandoverCoverage =
  "covered" | "missing" | "skipped" | "inactive" | "not-applicable";

export interface HandoverRequirement {
  id: string;
  title: string;
  priority: RequirementPriority;
  subject?: string;
  contextEvidence?: readonly Evidence[];
  expectedSource?: "repository" | "human";
  completion?: "confirmed-human" | "observed" | "confirmed-flow";
}

export interface HandoverArea {
  id: string;
  title: string;
  requirements: readonly HandoverRequirement[];
}

export interface HandoverStandard {
  areas: readonly HandoverArea[];
}

export interface HandoverKnowledge {
  classification: KnowledgeClassification;
  value?: string;
  evidence: readonly Evidence[];
}

export interface HandoverPlanRequirement extends HandoverRequirement {
  applicability: HandoverApplicability;
  coverage: HandoverCoverage;
  knowledge: readonly HandoverKnowledge[];
  evidence: readonly Evidence[];
}

export interface HandoverPlanArea {
  id: string;
  title: string;
  priority: RequirementPriority;
  requirements: HandoverPlanRequirement[];
}

export interface HandoverPlan {
  areas: HandoverPlanArea[];
  notes?: readonly HandoverNote[];
  integrations?: readonly HandoverIntegrationProfile[];
}

export interface HandoverNote {
  areaId: string;
  subject?: string;
  value: string;
}

export interface HandoverIntegrationProfile {
  id: string;
  provider: string;
  identity: "OBSERVED" | "INFERRED" | "UNKNOWN";
  endpoints: readonly string[];
  operations: readonly string[];
  configuration: readonly string[];
  relatedModules: readonly string[];
  callSites: readonly string[];
  authenticationEvidence: readonly Evidence[];
}

export interface HandoverKnowledgeLink {
  requirementId: string;
  entityId: string;
  field: string;
}

export interface HandoverObservation {
  requirementId: string;
  classification: "OBSERVED" | "INFERRED";
  evidence: readonly Evidence[];
  value?: string;
}

export interface HandoverPlanInput {
  notes?: readonly HandoverNote[];
  integrations?: readonly HandoverIntegrationProfile[];
  knowledge?: readonly KnowledgeEntry<string, string>[];
  knowledgeLinks?: readonly HandoverKnowledgeLink[];
  observations?: readonly HandoverObservation[];
  notApplicable?: readonly string[];
  inactive?: readonly string[];
  skipped?: readonly string[];
  confirmed?: readonly string[];
}

export function createHandoverPlan(
  standard: HandoverStandard,
  input: HandoverPlanInput = {},
): HandoverPlan {
  const notApplicable = new Set(input.notApplicable ?? []);
  const inactive = new Set(input.inactive ?? []);
  const skipped = new Set(input.skipped ?? []);
  const confirmed = new Set(input.confirmed ?? []);
  return {
    notes: input.notes ?? [],
    integrations: input.integrations ?? [],
    areas: standard.areas.map((area) => ({
      id: area.id,
      title: area.title,
      priority: area.requirements.some(
        ({ priority }) => priority === "critical",
      )
        ? "critical"
        : area.requirements.some(({ priority }) => priority === "recommended")
          ? "recommended"
          : "optional",
      requirements: area.requirements.map((requirement) => {
        const observations = (input.observations ?? [])
          .filter(({ requirementId }) => requirementId === requirement.id)
          .map(({ classification, evidence, value }) => ({
            classification,
            evidence: [...evidence],
            ...(value === undefined ? {} : { value }),
          }));
        const linkedKnowledge = (input.knowledgeLinks ?? [])
          .filter(({ requirementId }) => requirementId === requirement.id)
          .flatMap((link) =>
            (input.knowledge ?? [])
              .filter(
                ({ entityId, field, status }) =>
                  entityId === link.entityId &&
                  field === link.field &&
                  status !== "skipped",
              )
              .map((entry) => ({
                classification: "HUMAN" as const,
                value: entry.value,
                evidence: [],
              })),
          );
        const knowledge: HandoverKnowledge[] = [
          ...observations,
          ...linkedKnowledge,
        ];
        if (
          !knowledge.some(({ classification, value, evidence }) =>
            classification === "OBSERVED"
              ? evidence.length > 0
              : classification === "HUMAN" &&
                value !== undefined &&
                value.trim().length > 0,
          )
        ) {
          knowledge.push({ classification: "UNKNOWN", evidence: [] });
        }
        const applicable = !notApplicable.has(requirement.id);
        const hasObserved = knowledge.some(
          ({ classification, evidence }) =>
            classification === "OBSERVED" && evidence.length > 0,
        );
        const hasHuman = knowledge.some(
          ({ classification, value }) =>
            classification === "HUMAN" && Boolean(value?.trim()),
        );
        const completion =
          requirement.completion ??
          (requirement.expectedSource === "repository"
            ? "observed"
            : "confirmed-human");
        const covered =
          completion === "observed"
            ? hasObserved || (hasHuman && confirmed.has(requirement.id))
            : hasHuman && confirmed.has(requirement.id);
        const coverage: HandoverCoverage = !applicable
          ? "not-applicable"
          : inactive.has(requirement.id)
            ? "inactive"
            : skipped.has(requirement.id)
              ? "skipped"
              : covered
                ? "covered"
                : "missing";
        return {
          ...requirement,
          applicability: !applicable
            ? "not-applicable"
            : inactive.has(requirement.id)
              ? "inactive"
              : "applicable",
          coverage,
          knowledge,
          evidence: [
            ...new Map(
              [
                ...(requirement.contextEvidence ?? []),
                ...knowledge.flatMap(({ evidence }) => evidence),
              ].map((item) => [
                `${item.file}:${item.line ?? ""}:${item.description ?? ""}`,
                item,
              ]),
            ).values(),
          ],
        };
      }),
    })),
  };
}

export function observationsFromFindings(
  findings: readonly Finding[],
  requirementId: string,
): HandoverObservation[] {
  return findings.map((finding) => ({
    requirementId,
    classification: "OBSERVED",
    evidence: finding.evidence,
    value: finding.kind,
  }));
}
