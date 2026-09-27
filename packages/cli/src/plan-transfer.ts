import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  addCustomHandoverItem,
  createTransfer,
  mergeSuggestedPlan,
  moveHandoverItem,
  reviewHandoverItem,
  type HandoverItem,
  type Transfer,
} from "@transferkit/core";
import { renderTransferHandover } from "@transferkit/renderers";
import { scanRepository } from "@transferkit/scanners";
import { suggestTransferPlan } from "@transferkit/standards";
import { readTransferState, writeTransferState } from "./transfer-state.js";
import { snapshotTransfer } from "./transfer-markdown.js";

export async function planTransfer(
  directory: string,
  action?: string,
  args: readonly string[] = [],
): Promise<string> {
  const existing = await readTransferState(directory);
  let transfer: Transfer;
  if (action) {
    if (!existing)
      throw new Error("Create a plan with 'tk handover plan' first");
    let plan = existing.plan;
    if (
      action === "accept" ||
      action === "reject" ||
      action === "rename" ||
      action === "priority"
    ) {
      if (!args[0])
        throw new Error(
          `Usage: tk handover plan ${action} <item-id>${action === "rename" || action === "priority" ? " <value>" : ""}`,
        );
      plan = reviewHandoverItem(plan, args[0], action, args.slice(1).join(" "));
    } else if (action === "move") {
      if (!args[0] || !args[1] || !args[2])
        throw new Error(
          "Usage: tk handover plan move <item-id> <section-id> <position>",
        );
      plan = moveHandoverItem(plan, args[0], args[1], Number(args[2]));
    } else if (action === "add") {
      const [sectionId, type, priority, ...title] = args;
      if (!sectionId || !type || !priority || !title.length)
        throw new Error(
          "Usage: tk handover plan add <section-id> <type> <priority> <title>",
        );
      if (!isItemType(type) || !isPriority(priority))
        throw new Error("Invalid item type or priority");
      plan = addCustomHandoverItem(
        plan,
        sectionId,
        title.join(" "),
        type,
        priority,
      );
    } else throw new Error(`Unknown plan action: ${action}`);
    transfer = { ...existing, plan };
  } else {
    transfer = (await refreshTransferSuggestions(directory)).transfer;
  }
  const document = join(directory, "HANDOVER.md");
  let documentMessage: string;
  try {
    const contents = await readFile(document, "utf8");
    await writeTransferState(directory, transfer);
    documentMessage = contents.includes("<!-- tk:handover-v3 -->")
      ? "Existing HANDOVER.md preserved. Run 'tk handover sync' to import supported edits; CLI and Markdown changes to the same fields may require conflict resolution."
      : contents.includes(
            "This package combines repository evidence and maintainer knowledge for ownership transfer.",
          ) || contents.includes("Covered requirements:")
        ? "Existing v2 generated export preserved. Move or back it up before generating v3 HANDOVER.md."
        : "Existing HANDOVER.md preserved. Move or back it up before generating v3 HANDOVER.md.";
  } catch (error) {
    if (!isMissing(error)) throw error;
    transfer = { ...transfer, markdownSnapshot: snapshotTransfer(transfer) };
    await writeTransferState(directory, transfer);
    try {
      await writeFile(document, renderTransferHandover(transfer), {
        encoding: "utf8",
        flag: "wx",
      });
      documentMessage = "Generated HANDOVER.md.";
    } catch (writeError) {
      if (!isExists(writeError)) throw writeError;
      documentMessage =
        "Existing HANDOVER.md preserved. Move or back it up before generating v3 HANDOVER.md.";
    }
  }
  const visible = transfer.plan.items.filter(
    (item) =>
      item.provenance.kind !== "SUGGESTED" ||
      item.provenance.decision !== "REJECTED",
  );
  const pending = visible.filter(
    (item) =>
      item.provenance.kind === "SUGGESTED" &&
      item.provenance.decision === "PENDING",
  );
  const summary = `Handover Plan: ${visible.length} items, ${pending.length} pending review, ${visible.filter((item) => item.status === "DONE").length} done.`;
  return [
    summary,
    documentMessage,
    ...pending
      .slice(0, 8)
      .map((item) => `  ${item.id}  ${item.title} (${item.type})`),
    pending.length > 8
      ? `  ...and ${pending.length - 8} more in .transferkit/transfer.json`
      : "",
    "Review: tk handover plan accept|reject|rename|priority|move|add ...",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function refreshTransferSuggestions(
  directory: string,
): Promise<{ transfer: Transfer; findingsCount: number }> {
  const findings = await scanRepository(directory);
  const existing = await readTransferState(directory);
  const transfer =
    existing ?? createTransfer(await projectName(directory), "Unassigned");
  const updated = {
    ...transfer,
    plan: mergeSuggestedPlan(transfer.plan, suggestTransferPlan(findings)),
  };
  await writeTransferState(directory, updated);
  return { transfer: updated, findingsCount: findings.length };
}

async function projectName(directory: string): Promise<string> {
  try {
    const value: unknown = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string" &&
      value.name.trim()
    )
      return value.name;
  } catch {
    /* The scanner reports malformed package metadata. */
  }
  return basename(directory);
}
function isItemType(value: string): value is HandoverItem["type"] {
  return [
    "WALKTHROUGH",
    "ACTION",
    "OWNERSHIP",
    "OPEN_WORK",
    "RISK",
    "VERIFY",
    "REFERENCE",
  ].includes(value);
}
function isPriority(value: string): value is HandoverItem["priority"] {
  return ["CRITICAL", "RECOMMENDED", "OPTIONAL"].includes(value);
}
function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function isExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
