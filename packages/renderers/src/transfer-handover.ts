import {
  sectionProgress,
  type HandoverItem,
  type Transfer,
} from "@transferkit/core";

export function renderTransferHandover(transfer: Transfer): string {
  const active = transfer.plan.items.filter(
    (item) =>
      item.provenance.kind !== "SUGGESTED" ||
      item.provenance.decision !== "REJECTED",
  );
  const done = active.filter((item) => item.status === "DONE").length;
  const lines = [
    `# ${safe(transfer.project.name)} Handover`,
    "",
    "<!-- tk:handover-v3 -->",
    "",
    `Current Owner: ${safe(transfer.currentOwner)}`,
    `Next Owner: ${safe(transfer.nextOwner ?? "")}`,
    `Target Date: ${safe(transfer.targetDate ?? "")}`,
    "",
    `Progress at generation: ${done} / ${active.length}`,
    "",
    "## How to use this handover",
    "",
    "Work through the sections in order. Each heading is one handover item; its checkbox shows whether that item is complete. **Progress** shows completed items in the section and is updated by sync.",
    "",
    "**Priority:** _[Critical]_ means essential for the transfer; _[Recommended]_ means useful to cover; _[Optional]_ means cover if relevant. Priority indicates importance, not completion.",
    "",
    "**Item type:** A heading without a type is a walkthrough. Action, Ownership, Open work, Risk, Verify, and Reference items show their type in the heading and have their own Completion fields. Fill those fields before checking the item.",
    "",
    "**During the meeting:** Check the required points under Cover as they are discussed. Add decisions, explanations, and follow-up details under Notes. Context names and collapsed Code references are repository clues to inspect, not answers to accept without review.",
    "",
    "**When finished with an item:** Mark its heading with [x], [X], [✓], or [✔]. A walkthrough also needs its required Cover points checked; other types need their Completion fields filled. Leave the `tk:` markers in place so edits can be synced.",
    "",
    "**Update progress:** Run `tk handover sync` after editing, then `tk handover status` for live progress and any incomplete items. Section Status can be not started, in progress, completed, blocked, skipped, or not applicable.",
    "",
  ];
  for (const section of transfer.plan.sections) {
    const items = section.itemIds
      .map((id) => active.find((item) => item.id === id))
      .filter((item): item is HandoverItem => item !== undefined);
    if (!items.length) continue;
    const progress = sectionProgress(section, transfer.plan.items);
    lines.push(
      "---",
      "",
      `## ${safe(section.title)}`,
      `<!-- tk:section ${section.id} -->`,
      "",
      `**Status:** ${progress.status.toLowerCase().replaceAll("_", " ")}  `,
      `**Progress:** ${progress.done} / ${progress.total}`,
      "",
    );
    for (const item of items) {
      lines.push(
        `### [${item.status === "DONE" ? "x" : " "}] ${safe(item.title)} _[${displayPriority(item.priority)}${item.type === "WALKTHROUGH" ? "" : ` · ${displayType(item.type)}`}]_`,
        `<!-- tk:item ${item.id} -->`,
      );
      if (item.checklist.length)
        lines.push(
          "",
          "#### Cover",
          "",
          ...item.checklist.map(
            (point) =>
              `- [${point.covered ? "x" : " "}] ${safe(point.text)} <!-- tk:point ${point.id} -->`,
          ),
        );
      if (item.type !== "WALKTHROUGH")
        lines.push("", "#### Completion", "", ...completionFields(item));
      const context = [
        ...new Set(
          item.repositoryContext
            .map((reference) => contextName(reference.path))
            .filter((name): name is string => Boolean(name)),
        ),
      ].slice(0, 4);
      if (context.length)
        lines.push(
          "",
          `**Context:** ${context.map((name) => `\`${safe(name)}\``).join(" · ")}`,
        );
      lines.push("", "**Notes**");
      lines.push(
        "<!-- tk:notes:start -->",
        item.notes ?? "",
        "<!-- tk:notes:end -->",
      );
      if (item.repositoryContext.length) {
        lines.push("", "<details>", "<summary>Code references</summary>", "");
        lines.push("<!-- tk:context:start -->");
        lines.push(
          ...item.repositoryContext
            .slice(0, 6)
            .map(
              (reference) =>
                `- \`${safe(reference.path)}${reference.line ? `:${reference.line}` : ""}\``,
            ),
        );
        lines.push("<!-- tk:context:end -->", "", "</details>");
      } else lines.push("<!-- tk:context:start -->", "<!-- tk:context:end -->");
      const cases = item.attachments.filter(
        (attachment) => attachment.kind === "CASE",
      );
      const references = item.attachments.filter(
        (attachment) => attachment.kind !== "CASE",
      );
      if (cases.length)
        lines.push(
          "",
          "#### Open Cases",
          "",
          ...cases.map((attachment) => `- ${safe(attachment.value)}`),
        );
      if (references.length)
        lines.push(
          "",
          "#### References",
          "",
          ...references.map(
            (attachment) => `- ${attachment.kind}: ${safe(attachment.value)}`,
          ),
        );
      if (items.length > 1)
        lines.push("", "</br>", '<hr style="width: 50%;margin: 0;">', "</br>");
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function contextName(path: string): string | undefined {
  const file = path.split("/").at(-1);
  if (!file) return undefined;
  const stem = file.replace(/\.(?:tsx?|jsx?|mjs|cjs)$/u, "");
  if (stem === file) return undefined;
  const name = stem
    .split(/[.\-_]/u)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return name || undefined;
}

function displayPriority(priority: HandoverItem["priority"]): string {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function displayType(type: HandoverItem["type"]): string {
  return type
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}

function safe(value: string): string {
  return value.replace(/\r?\n/gu, " ").replace(/[<>]/gu, "");
}

function completionFields(item: HandoverItem): string[] {
  switch (item.type) {
    case "WALKTHROUGH":
      return [`Confirmed: ${item.completion.confirmed ? "yes" : "no"}`];
    case "ACTION":
      return [`Performed: ${item.completion.performed ? "yes" : "no"}`];
    case "OWNERSHIP":
      return [`Assignee: ${safe(item.completion.assignee ?? "")}`];
    case "OPEN_WORK":
      return [
        `Current Status: ${safe(item.completion.currentStatus ?? "")}`,
        `Assignee: ${safe(item.completion.assignee ?? "")}`,
        `Disposition: ${safe(item.completion.disposition ?? "")}`,
      ];
    case "RISK":
      return [
        `Risk: ${safe(item.completion.risk ?? "")}`,
        `Mitigation or Recovery: ${safe(item.completion.mitigationOrRecovery ?? "")}`,
        `Owner: ${safe(item.completion.owner ?? "")}`,
        `Accepted: ${item.completion.accepted ? "yes" : "no"}`,
      ];
    case "VERIFY":
      return [`Succeeded: ${item.completion.succeeded ? "yes" : "no"}`];
    case "REFERENCE":
      return [
        `Required Attachment IDs: ${item.completion.requiredAttachmentIds.join(", ")}`,
      ];
  }
}
