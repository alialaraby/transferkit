import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sectionProgress } from "@transferkit/core";
import {
  parseTransferMarkdown,
  refreshSectionProgress,
} from "./transfer-markdown.js";
import { readTransferState, writeTransferState } from "./transfer-state.js";

export async function syncTransfer(directory: string): Promise<string> {
  const transfer = await readTransferState(directory);
  if (!transfer)
    throw new Error("No v3 Transfer state. Run 'tk handover plan' first.");
  const document = await readFile(join(directory, "HANDOVER.md"), "utf8");
  const result = parseTransferMarkdown(document, transfer);
  const refreshed = refreshSectionProgress(document, result.transfer);
  // Validate all edits before either write. Only managed section fields are refreshed.
  await writeTransferState(directory, result.transfer);
  if (refreshed !== document)
    await writeFile(join(directory, "HANDOVER.md"), refreshed, "utf8");
  return [
    "Synced HANDOVER.md",
    "",
    `${result.checklistUpdates} checklist updates`,
    `${result.completionRequests} item completion requested`,
    `${result.incomplete.length} items remain incomplete after request`,
    ...result.transfer.plan.sections
      .filter((section) =>
        ["BLOCKED", "SKIPPED", "NOT_APPLICABLE"].includes(
          sectionProgress(section, result.transfer.plan.items).status,
        ),
      )
      .map(
        (section) =>
          `${section.title}: ${sectionProgress(section, result.transfer.plan.items).status}`,
      ),
    ...result.incomplete.flatMap(({ title, missing }) => [
      "",
      title,
      ...missing.map((reason) => `Missing: ${reason}`),
    ]),
    ...result.notices.map((notice) => `Notice: ${notice}`),
  ].join("\n");
}
