import { randomUUID } from "node:crypto";
import type { HandoverItem, HandoverPlan } from "./transfer.js";

export function mergeSuggestedPlan(
  current: HandoverPlan,
  suggested: HandoverPlan,
): HandoverPlan {
  const bySuggestion = new Map(
    current.items.flatMap((item) =>
      item.provenance.kind === "SUGGESTED"
        ? [[item.provenance.suggestionId, item] as const]
        : [],
    ),
  );
  const sections = current.sections.map((section) => ({
    ...section,
    itemIds: [...section.itemIds],
  }));
  const items = [...current.items];
  for (const proposedSection of suggested.sections) {
    let section = sections.find(
      (candidate) => candidate.title === proposedSection.title,
    );
    if (!section) {
      section = {
        id: proposedSection.id,
        title: proposedSection.title,
        itemIds: [],
      };
      sections.push(section);
    }
    for (const proposedId of proposedSection.itemIds) {
      const proposed = suggested.items.find((item) => item.id === proposedId);
      if (!proposed || proposed.provenance.kind !== "SUGGESTED") continue;
      const previous = bySuggestion.get(proposed.provenance.suggestionId);
      if (!previous) {
        items.push(proposed);
        section.itemIds.push(proposed.id);
      } else if (
        previous.provenance.kind === "SUGGESTED" &&
        previous.provenance.decision === "PENDING"
      ) {
        const index = items.findIndex((item) => item.id === previous.id);
        items[index] = {
          ...previous,
          repositoryContext: proposed.repositoryContext,
        };
      }
    }
  }
  return { ...current, sections, items };
}

export function reviewHandoverItem(
  plan: HandoverPlan,
  itemId: string,
  action: "accept" | "reject" | "rename" | "priority",
  value?: string,
): HandoverPlan {
  const item = plan.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Unknown Handover Item: ${itemId}`);
  let updated: HandoverItem;
  if (action === "accept" || action === "reject") {
    if (item.provenance.kind !== "SUGGESTED")
      throw new Error("Only suggestions can be accepted or rejected");
    updated = {
      ...item,
      provenance: {
        ...item.provenance,
        decision: action === "accept" ? "ACCEPTED" : "REJECTED",
      },
    };
  } else if (action === "rename") {
    if (!value?.trim()) throw new Error("A nonempty title is required");
    updated = { ...item, title: value.trim() };
  } else {
    if (value !== "CRITICAL" && value !== "RECOMMENDED" && value !== "OPTIONAL")
      throw new Error("Priority must be CRITICAL, RECOMMENDED, or OPTIONAL");
    updated = { ...item, priority: value };
  }
  return {
    ...plan,
    reviewedAt: new Date().toISOString(),
    items: plan.items.map((candidate) =>
      candidate.id === itemId ? updated : candidate,
    ),
  };
}

export function moveHandoverItem(
  plan: HandoverPlan,
  itemId: string,
  sectionId: string,
  position: number,
): HandoverPlan {
  if (!plan.items.some((item) => item.id === itemId))
    throw new Error(`Unknown Handover Item: ${itemId}`);
  const destination = plan.sections.find((section) => section.id === sectionId);
  if (!destination) throw new Error(`Unknown section: ${sectionId}`);
  if (
    !Number.isInteger(position) ||
    position < 1 ||
    position > destination.itemIds.length + 1
  )
    throw new Error("Position is out of range");
  const sections = plan.sections.map((section) => ({
    ...section,
    itemIds: section.itemIds.filter((id) => id !== itemId),
  }));
  const target = sections.find((section) => section.id === sectionId)!;
  target.itemIds.splice(position - 1, 0, itemId);
  return { ...plan, reviewedAt: new Date().toISOString(), sections };
}

export function addCustomHandoverItem(
  plan: HandoverPlan,
  sectionId: string,
  title: string,
  type: HandoverItem["type"],
  priority: HandoverItem["priority"],
): HandoverPlan {
  if (!title.trim()) throw new Error("A nonempty title is required");
  const section = plan.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Unknown section: ${sectionId}`);
  const base = {
    id: randomUUID(),
    title: title.trim(),
    type,
    priority,
    status: "TODO" as const,
    checklist: [],
    attachments: [],
    repositoryContext: [],
    provenance: { kind: "MANUAL" as const },
  };
  let item: HandoverItem;
  switch (type) {
    case "WALKTHROUGH":
      item = { ...base, type, completion: { confirmed: false } };
      break;
    case "ACTION":
      item = { ...base, type, completion: { performed: false } };
      break;
    case "OWNERSHIP":
      item = { ...base, type, completion: {} };
      break;
    case "OPEN_WORK":
      item = { ...base, type, completion: {} };
      break;
    case "RISK":
      item = { ...base, type, completion: { requiresOwnerOrAcceptance: true } };
      break;
    case "VERIFY":
      item = { ...base, type, completion: { succeeded: false } };
      break;
    case "REFERENCE":
      item = { ...base, type, completion: { requiredAttachmentIds: [] } };
      break;
  }
  return {
    ...plan,
    reviewedAt: new Date().toISOString(),
    sections: plan.sections.map((candidate) =>
      candidate.id === sectionId
        ? { ...candidate, itemIds: [...candidate.itemIds, item.id] }
        : candidate,
    ),
    items: [...plan.items, item],
  };
}
