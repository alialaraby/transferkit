import type { Evidence } from "@transferkit/core";
import { scanRepository, type RepositoryFinding } from "@transferkit/scanners";

export async function inspectEvidence(
  workingDirectory: string,
): Promise<string> {
  return renderEvidence(await scanRepository(workingDirectory));
}

export function renderEvidence(findings: readonly RepositoryFinding[]): string {
  if (findings.length === 0) return "No findings discovered.";

  return findings
    .map((finding) => {
      const title = `${finding.kind}: ${findingName(finding)}`;
      if (finding.evidence.length === 0) {
        return `${title}\n  (no evidence recorded)`;
      }
      return [title, ...finding.evidence.map(renderEvidenceItem)].join("\n");
    })
    .join("\n\n");
}

function renderEvidenceItem(evidence: Evidence): string {
  const location = `${evidence.file}${evidence.line === undefined ? "" : `:${evidence.line}`}`;
  return `  ${location} — ${evidence.description ?? "Evidence recorded"}`;
}

function findingName(finding: RepositoryFinding): string {
  const data = finding.data as Record<string, unknown>;
  for (const key of ["name", "service", "client", "handler"] as const) {
    if (typeof data[key] === "string") return data[key];
  }
  return finding.id;
}
