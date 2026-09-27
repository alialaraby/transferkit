import {
  evaluateItemCompletion,
  sectionProgress,
  type HandoverItem,
  type Transfer,
} from "@transferkit/core";

export function renderTransferStatus(transfer: Transfer): string {
  const byId = new Map(transfer.plan.items.map((item) => [item.id, item]));
  const items = transfer.plan.sections
    .filter(
      (section) =>
        sectionProgress(section, transfer.plan.items).status !==
        "NOT_APPLICABLE",
    )
    .flatMap((section) => section.itemIds.map((id) => byId.get(id)!))
    .filter(
      (item) =>
        item.status !== "NOT_APPLICABLE" &&
        (item.provenance.kind !== "SUGGESTED" ||
          item.provenance.decision !== "REJECTED"),
    );
  const done = (item: HandoverItem) =>
    item.status === "DONE" && evaluateItemCompletion(item).complete;
  const count = (group: HandoverItem[]) =>
    `${group.filter(done).length} / ${group.length}`;
  const next = items.find(
    (item) =>
      !done(item) &&
      item.status !== "SKIPPED" &&
      item.status !== "NOT_APPLICABLE",
  );
  return [
    `${transfer.project.name} Handover`,
    "",
    `${count(items)} complete`,
    "",
    ...(["CRITICAL", "RECOMMENDED", "OPTIONAL"] as const).map(
      (priority) =>
        `${priority[0]}${priority.slice(1).toLowerCase()}`.padEnd(16) +
        count(items.filter((item) => item.priority === priority)),
    ),
    "",
    `Blocked         ${items.filter((item) => item.status === "BLOCKED").length}`,
    `Skipped         ${items.filter((item) => item.status === "SKIPPED").length}`,
    `Not applicable  ${transfer.plan.sections.filter((section) => sectionProgress(section, transfer.plan.items).status === "NOT_APPLICABLE").length} sections`,
    `Open work       ${items.filter((item) => item.type === "OPEN_WORK" && !done(item)).length}`,
    `Ownership       ${items.filter((item) => item.type === "OWNERSHIP" && !done(item)).length} remaining`,
    `Verification    ${items.filter((item) => item.type === "VERIFY" && !done(item)).length} remaining`,
    "",
    `Next: ${next?.title ?? "All active items complete"}`,
    "",
    ...transfer.plan.sections
      .filter((section) => section.itemIds.length > 0)
      .map((section) => {
        const progress = sectionProgress(section, transfer.plan.items);
        return `${section.title}: ${progress.status.replaceAll("_", " ").toLowerCase()} (${progress.done} / ${progress.total})`;
      }),
  ].join("\n");
}
