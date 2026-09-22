import type { KnowledgeRequirement } from "@transferkit/core";

import { messagingConsumerRequirements } from "./messaging-standard.js";

export type HandoverKnowledgeField =
  | "criticality"
  | "failureBehavior"
  | "recoveryProcedure"
  | "operationalOwner"
  | "concurrencyConcerns"
  | "criticalData"
  | "migrationRisks"
  | "dataRecovery"
  | "dataOwner"
  | "businessImportance"
  | "externalOwner"
  | "sandboxAvailability"
  | "credentialLifecycle"
  | "environmentDifferences"
  | "requiredConfiguration"
  | "configurationOwner"
  | "deploymentProcess"
  | "rollbackProcedure"
  | "deploymentOwner"
  | "deliveryCaveats";

const requirements: KnowledgeRequirement<string, HandoverKnowledgeField>[] = [
  ...messagingConsumerRequirements,
  req(
    "scheduled-job.criticality",
    "scheduled-job",
    "criticality",
    "Business criticality",
    "critical",
  ),
  req(
    "scheduled-job.failure",
    "scheduled-job",
    "failureBehavior",
    "Failure impact",
    "critical",
  ),
  req(
    "scheduled-job.recovery",
    "scheduled-job",
    "recoveryProcedure",
    "Safe rerun / recovery",
    "critical",
  ),
  req(
    "scheduled-job.concurrency",
    "scheduled-job",
    "concurrencyConcerns",
    "Concurrency / overlap concerns",
    "recommended",
  ),
  req(
    "scheduled-job.owner",
    "scheduled-job",
    "operationalOwner",
    "Operational owner",
    "critical",
  ),
  req(
    "database.critical-data",
    "database",
    "criticalData",
    "Critical data / tables",
    "critical",
  ),
  req(
    "database.migrations",
    "database",
    "migrationRisks",
    "Dangerous or manual migrations",
    "critical",
  ),
  req(
    "database.recovery",
    "database",
    "dataRecovery",
    "Backup, recovery, and operational risk",
    "critical",
  ),
  req("database.owner", "database", "dataOwner", "Data owner", "recommended"),
  req(
    "integration.importance",
    "integration",
    "businessImportance",
    "Business importance",
    "critical",
  ),
  req(
    "integration.failure",
    "integration",
    "failureBehavior",
    "Failure behavior",
    "critical",
  ),
  req(
    "integration.owner",
    "integration",
    "externalOwner",
    "External owner / contact",
    "critical",
  ),
  req(
    "integration.sandbox",
    "integration",
    "sandboxAvailability",
    "Sandbox availability",
    "recommended",
  ),
  req(
    "integration.credentials",
    "integration",
    "credentialLifecycle",
    "Credential lifecycle / rotation",
    "critical",
  ),
  req(
    "configuration.environments",
    "configuration",
    "environmentDifferences",
    "Important environment differences",
    "critical",
  ),
  req(
    "configuration.required",
    "configuration",
    "requiredConfiguration",
    "Undocumented required configuration",
    "critical",
  ),
  req(
    "configuration.owner",
    "configuration",
    "configurationOwner",
    "Configuration owner",
    "recommended",
  ),
  ...deliveryRequirements("containerization"),
  ...deliveryRequirements("ci.workflow"),
];

export const handoverRequirements = requirements;

function deliveryRequirements(
  entityKind: "containerization" | "ci.workflow",
): KnowledgeRequirement<string, HandoverKnowledgeField>[] {
  return [
    req(
      `${entityKind}.process`,
      entityKind,
      "deploymentProcess",
      "Production deployment process",
      "critical",
    ),
    req(
      `${entityKind}.rollback`,
      entityKind,
      "rollbackProcedure",
      "Rollback procedure",
      "critical",
    ),
    req(
      `${entityKind}.owner`,
      entityKind,
      "deploymentOwner",
      "Deployment owner",
      "critical",
    ),
    req(
      `${entityKind}.caveats`,
      entityKind,
      "deliveryCaveats",
      "Important CI/CD or deployment caveats",
      "recommended",
    ),
  ];
}

function req(
  id: string,
  entityKind: string,
  field: HandoverKnowledgeField,
  title: string,
  priority: "critical" | "recommended",
): KnowledgeRequirement<string, HandoverKnowledgeField> {
  return { id, entityKind, field, title, priority };
}
