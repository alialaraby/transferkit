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
    "Edit this Markdown normally. Mark boxes with [x], [X], [✓], or [✔]; add text under Notes. Edit section Status to not started, in progress, completed, blocked, skipped, or not applicable. Run `tk handover sync`, then `tk handover status` for live progress. Items marked Pending review need Current Owner review.",
    "",
  ];
  for (const section of transfer.plan.sections) {
    const items = section.itemIds
      .map((id) => active.find((item) => item.id === id))
      .filter((item): item is HandoverItem => item !== undefined);
    if (!items.length) continue;
    const progress = sectionProgress(section, transfer.plan.items);
    lines.push(
      `## ${safe(section.title)}`,
      `<!-- tk:section ${section.id} -->`,
      "",
      `**Status:** ${progress.status.toLowerCase().replaceAll("_", " ")}`,
      `**Progress:** ${progress.done} / ${progress.total}`,
      "",
    );
    for (const item of items) {
      lines.push(
        `### ${safe(item.title)}`,
        `<!-- tk:item ${item.id} -->`,
        "",
        `- [${item.status === "DONE" ? "x" : " "}] Complete item`,
        "",
        `> **${displayPriority(item.priority)}** · ${displayType(item.type)}${item.provenance.kind === "SUGGESTED" ? ` · ${item.provenance.decision === "PENDING" ? "Pending review" : "Accepted"}` : ""}`,
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
      lines.push("", "#### Completion", "", ...completionFields(item));
      lines.push("");
      if (item.repositoryContext.length) {
        lines.push("#### Repository Context", "");
      }
      lines.push("<!-- tk:context:start -->");
      if (item.repositoryContext.length) {
        lines.push(
          ...item.repositoryContext
            .slice(0, 6)
            .map(
              (context) =>
                `- ${safe(context.path)}${context.line ? `:${context.line}` : ""}`,
            ),
        );
      }
      lines.push("<!-- tk:context:end -->", "");
      lines.push("#### Notes");
      lines.push(
        "<!-- tk:notes:start -->",
        item.notes ?? "",
        "<!-- tk:notes:end -->",
      );
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
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
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
