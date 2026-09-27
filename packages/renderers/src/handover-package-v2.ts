import {
  redactLikelySecrets,
  summarizeHandoverCoverage,
  type HandoverPlan,
  type HandoverPlanArea,
  type HandoverPlanRequirement,
  type HandoverNote,
  type HandoverIntegrationProfile,
} from "@transferkit/core";
import type { HandoverDocument } from "./handover-package.js";

const sections: readonly {
  fileName: string;
  title: string;
  areas: readonly string[];
}[] = [
  {
    fileName: "system-overview.md",
    title: "System Overview",
    areas: ["system-overview", "business-domains"],
  },
  {
    fileName: "architecture.md",
    title: "Architecture and Codebase",
    areas: ["architecture", "codebase-structure"],
  },
  {
    fileName: "business-flows.md",
    title: "Critical Business Flows",
    areas: ["critical-business-flows"],
  },
  {
    fileName: "data.md",
    title: "Data and Persistence",
    areas: ["data-persistence"],
  },
  {
    fileName: "integrations.md",
    title: "External Integrations",
    areas: ["external-integrations"],
  },
  {
    fileName: "async-and-jobs.md",
    title: "Async Processing and Scheduled Jobs",
    areas: ["async-processing", "scheduled-jobs"],
  },
  {
    fileName: "security.md",
    title: "Security and Access",
    areas: ["security", "authentication-authorization"],
  },
  {
    fileName: "deployment.md",
    title: "Deployment and Configuration",
    areas: ["deployment", "infrastructure", "runtime-configuration"],
  },
  {
    fileName: "operations.md",
    title: "Operations",
    areas: [
      "operations",
      "observability",
      "testing",
      "local-development",
      "tribal-knowledge",
    ],
  },
  {
    fileName: "failures-and-recovery.md",
    title: "Failure and Recovery",
    areas: ["failure-recovery"],
  },
  {
    fileName: "known-problems.md",
    title: "Known Problems and Technical Debt",
    areas: ["known-problems", "technical-debt"],
  },
  {
    fileName: "work-in-progress.md",
    title: "Work in Progress",
    areas: ["work-in-progress"],
  },
  {
    fileName: "ownership.md",
    title: "Ownership and Contacts",
    areas: ["ownership-contacts"],
  },
  {
    fileName: "custom-topics.md",
    title: "Project-Specific Topics",
    areas: ["custom-topics"],
  },
];

export function renderHandoverPackageV2(
  plan: HandoverPlan,
  projectName: string,
  context: readonly string[] = [],
): HandoverDocument[] {
  const report = summarizeHandoverCoverage(plan);
  const documents: HandoverDocument[] = [];
  for (const section of sections) {
    const areas = section.areas.flatMap((id) =>
      plan.areas.filter((area) => area.id === id),
    );
    let content = renderSection(
      section.title,
      areas,
      plan.notes ?? [],
      section.fileName === "integrations.md" ? (plan.integrations ?? []) : [],
    );
    if (section.fileName === "system-overview.md") {
      content = [
        content?.trimEnd() ?? "# System Overview",
        "",
        "## Repository identity",
        "",
        `- Package: ${safe(projectName)} (package.json)`,
        ...(context.length
          ? [`- Detected technologies: ${context.map(safe).join(", ")}`]
          : []),
        "",
      ].join("\n");
    }
    if (content)
      documents.push({ fileName: section.fileName, contents: content });
  }
  const gaps = plan.areas.flatMap((area) =>
    area.requirements
      .filter(
        ({ coverage }) => coverage === "missing" || coverage === "skipped",
      )
      .map((requirement) => ({ area: area.title, requirement })),
  );
  const gapLines = [
    "# Remaining Knowledge Gaps",
    "",
    `Critical: ${report.gaps.critical} · Recommended: ${report.gaps.recommended} · Optional: ${report.gaps.optional}`,
    "",
  ];
  if (gaps.length === 0)
    gapLines.push("No unresolved applicable requirements.");
  else {
    for (const area of plan.areas) {
      const areaGaps = gaps.filter((gap) => gap.area === area.title);
      if (!areaGaps.length) continue;
      gapLines.push(`## ${safe(area.title)}`, "");
      for (const { requirement } of areaGaps) {
        const label = requirement.subject
          ? `${requirement.subject}: ${requirement.title}`
          : requirement.title;
        gapLines.push(
          `- ${safe(label)} — ${requirement.coverage === "skipped" ? "intentionally skipped" : requirement.expectedSource === "repository" ? "repository context not established" : "maintainer knowledge needed"} (${requirement.priority})`,
        );
      }
      gapLines.push("");
    }
  }
  documents.push({
    fileName: "remaining-gaps.md",
    contents: `${gapLines.join("\n").trimEnd()}\n`,
  });
  const links = documents.map(
    ({ fileName }) =>
      `- [${fileName.replace(/\.md$/u, "").replace(/-/gu, " ")}](${fileName})`,
  );
  documents.unshift({
    fileName: "README.md",
    contents: [
      `# ${safe(projectName)} Handover`,
      "",
      "This package combines repository evidence and maintainer knowledge for ownership transfer.",
      "",
      `Covered requirements: ${report.totals.covered}/${report.totals.total}. Observed: ${report.totals.observed}; human knowledge: ${report.totals.human}.`,
      `Remaining gaps: ${report.gaps.critical} critical, ${report.gaps.recommended} recommended, ${report.gaps.optional} optional.`,
      "",
      "## Contents",
      "",
      ...links,
      "",
    ].join("\n"),
  });
  return documents;
}

function renderSection(
  title: string,
  areas: readonly HandoverPlanArea[],
  notes: readonly HandoverNote[],
  integrations: readonly HandoverIntegrationProfile[],
): string | undefined {
  const lines = [`# ${safe(title)}`, ""];
  for (const area of areas) {
    lines.push(`## ${safe(area.title)}`, "");
    const subjects = [
      ...new Set(area.requirements.map(({ subject }) => subject ?? "")),
    ];
    for (const subject of subjects) {
      if (subject) lines.push(`### ${safe(subject)}`, "");
      const requirements = area.requirements.filter(
        (item) => (item.subject ?? "") === subject,
      );
      const profile = integrations.find(({ provider }) => provider === subject);
      if (profile) appendIntegrationProfile(lines, profile);
      for (const requirement of requirements) {
        appendRequirement(lines, requirement);
      }
      for (const note of notes.filter(
        (item) => item.areaId === area.id && (item.subject ?? "") === subject,
      ))
        lines.push(
          `- Maintainer context (not counted as coverage): ${safe(note.value)}`,
          "",
        );
      const missing = requirements.filter(
        ({ coverage }) => coverage === "missing" || coverage === "skipped",
      );
      if (missing.length)
        lines.push(
          `${missing.length} topic${missing.length === 1 ? "" : "s"} still to explain; see [remaining gaps](remaining-gaps.md).`,
          "",
        );
      if (!profile) {
        const evidence = [
          ...new Map(
            requirements
              .flatMap(({ evidence }) => evidence)
              .map((item) => [`${item.file}:${item.line ?? ""}`, item]),
          ).values(),
        ].slice(0, 8);
        if (evidence.length)
          lines.push(
            `Repository references: ${evidence.map(({ file, line, description }) => `\`${safe(file)}${line ? `:${line}` : ""}\`${description ? ` (${safe(description)})` : ""}`).join(", ")}`,
            "",
          );
      }
    }
  }
  if (lines.length === 2) return undefined;
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendRequirement(
  lines: string[],
  requirement: HandoverPlanRequirement,
): void {
  const observed = requirement.knowledge.filter(
    ({ classification }) => classification === "OBSERVED",
  );
  const human = requirement.knowledge.filter(
    ({ classification }) => classification === "HUMAN",
  );
  const inferred = requirement.knowledge.filter(
    ({ classification }) => classification === "INFERRED",
  );
  if (!observed.length && !human.length && !inferred.length) return;
  lines.push(`**${safe(requirement.title)}**`);
  for (const item of observed)
    if (item.value) lines.push(`- Observed: ${safe(item.value)}`);
  for (const item of human)
    if (item.value?.trim())
      lines.push(
        `- Maintainer${requirement.coverage === "covered" ? "" : " (recorded; coverage incomplete)"}: ${safe(item.value)}`,
      );
  for (const item of inferred)
    if (item.value)
      lines.push(`- Suggested by evidence (unconfirmed): ${safe(item.value)}`);
  lines.push("");
}

function appendIntegrationProfile(
  lines: string[],
  profile: HandoverIntegrationProfile,
): void {
  lines.push(
    `Identity: ${safe(profile.provider)} (${profile.identity === "INFERRED" ? "inferred, unconfirmed" : profile.identity.toLowerCase()})`,
  );
  if (profile.endpoints.length)
    lines.push(`Endpoints: ${profile.endpoints.map(safe).join(", ")}`);
  if (profile.operations.length)
    lines.push(
      `Observed operations: ${profile.operations.map(safe).join(", ")}`,
    );
  if (profile.configuration.length)
    lines.push(
      `Configuration keys: ${profile.configuration.map(safe).join(", ")}`,
    );
  if (profile.relatedModules.length)
    lines.push(
      `Related components: ${profile.relatedModules.map(safe).join(", ")}`,
    );
  if (profile.authenticationEvidence.length)
    lines.push(
      `Authentication/configuration evidence: ${[...new Set(profile.authenticationEvidence.map(({ file, line }) => `${file}${line ? `:${line}` : ""}`))].map(safe).join(", ")}`,
    );
  if (profile.callSites.length)
    lines.push(`Call sites: ${profile.callSites.map(safe).join(", ")}`);
  lines.push("");
}

function safe(value: string): string {
  return redactLikelySecrets(value).replace(/\r?\n/gu, " ").trim();
}
