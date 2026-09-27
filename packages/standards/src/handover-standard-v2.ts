import type {
  HandoverArea,
  HandoverStandard,
  RequirementPriority,
} from "@transferkit/core";

function area(
  id: string,
  title: string,
  requirements: readonly [string, string, RequirementPriority][],
): HandoverArea {
  return {
    id,
    title,
    requirements: requirements.map(([key, name, priority]) => ({
      id: `${id}.${key}`,
      title: name,
      priority,
    })),
  };
}

// Coverage topics are deliberately broader than interview questions.
export const handoverStandardV2: HandoverStandard = {
  areas: [
    area("system-overview", "System Overview", [
      ["purpose", "Purpose and users", "critical"],
    ]),
    area("architecture", "Architecture", [
      ["structure", "Major components and boundaries", "critical"],
    ]),
    area("business-domains", "Business Domains", [
      ["domains", "Business domains and rules", "critical"],
    ]),
    area("critical-business-flows", "Critical Business Flows", [
      ["flows", "Critical flows and failure paths", "critical"],
    ]),
    area("codebase-structure", "Codebase Structure", [
      ["navigation", "Codebase organization and entry points", "recommended"],
    ]),
    area("data-persistence", "Data & Persistence", [
      ["data", "Critical data and persistence behavior", "critical"],
    ]),
    area("external-integrations", "External Integrations", [
      [
        "dependencies",
        "External dependencies and operational ownership",
        "critical",
      ],
    ]),
    area("authentication-authorization", "Authentication & Authorization", [
      ["access", "Authentication and authorization boundaries", "critical"],
    ]),
    area("async-processing", "Async Processing", [
      ["processing", "Asynchronous flows and recovery", "recommended"],
    ]),
    area("scheduled-jobs", "Scheduled Jobs", [
      ["jobs", "Job purpose, failure, and recovery", "recommended"],
    ]),
    area("runtime-configuration", "Runtime Configuration", [
      [
        "configuration",
        "Required configuration and environment differences",
        "critical",
      ],
    ]),
    area("infrastructure", "Infrastructure", [
      [
        "dependencies",
        "Infrastructure and runtime dependencies",
        "recommended",
      ],
    ]),
    area("deployment", "Deployment", [
      ["release", "Deployment and rollback procedure", "critical"],
    ]),
    area("operations", "Operations", [
      ["procedures", "Routine operational procedures", "critical"],
    ]),
    area("observability", "Observability", [
      ["signals", "Important logs, metrics, and alerts", "recommended"],
    ]),
    area("failure-recovery", "Failure & Recovery", [
      ["recovery", "Known failure modes and recovery", "critical"],
    ]),
    area("security", "Security", [
      ["practices", "Security boundaries and sensitive procedures", "critical"],
    ]),
    area("testing", "Testing", [
      ["strategy", "Testing strategy and important gaps", "recommended"],
    ]),
    area("local-development", "Local Development", [
      ["setup", "Local setup and development workflow", "recommended"],
    ]),
    area("known-problems", "Known Problems", [
      ["issues", "Known production problems and risks", "critical"],
    ]),
    area("technical-debt", "Technical Debt", [
      ["debt", "Important debt and constraints", "recommended"],
    ]),
    area("work-in-progress", "Work in Progress", [
      ["work", "Unfinished changes and pending decisions", "recommended"],
    ]),
    area("ownership-contacts", "Ownership & Contacts", [
      ["owners", "Owners and escalation contacts", "critical"],
    ]),
    area("tribal-knowledge", "Tribal Knowledge", [
      ["context", "Undocumented decisions and surprising behavior", "optional"],
    ]),
  ],
};
