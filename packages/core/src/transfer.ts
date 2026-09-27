import { randomUUID } from "node:crypto";

export const transferSchemaVersion = 1 as const;

export type ItemType =
  | "WALKTHROUGH"
  | "ACTION"
  | "OWNERSHIP"
  | "OPEN_WORK"
  | "RISK"
  | "VERIFY"
  | "REFERENCE";
export type ItemPriority = "CRITICAL" | "RECOMMENDED" | "OPTIONAL";
export type ItemStatus =
  "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "SKIPPED" | "NOT_APPLICABLE";

export interface ChecklistPoint {
  id: string;
  text: string;
  required: boolean;
  covered: boolean;
}

export interface Attachment {
  id: string;
  kind: "NOTE" | "FILE" | "URL" | "COMMAND" | "DOCUMENT" | "CASE";
  value: string;
}

export interface RepositoryContext {
  path: string;
  line?: number;
  description?: string;
  findingId?: string;
}

export type SuggestionDecision =
  | { kind: "MANUAL" }
  | {
      kind: "SUGGESTED";
      suggestionId: string;
      decision: "PENDING" | "ACCEPTED" | "REJECTED";
      scannerId?: string;
      findingId?: string;
    };

interface ItemBase {
  id: string;
  title: string;
  priority: ItemPriority;
  status: ItemStatus;
  checklist: ChecklistPoint[];
  attachments: Attachment[];
  repositoryContext: RepositoryContext[];
  notes?: string;
  provenance: SuggestionDecision;
}

export type HandoverItem = ItemBase &
  (
    | { type: "WALKTHROUGH"; completion: { confirmed: boolean } }
    | { type: "ACTION"; completion: { performed: boolean } }
    | { type: "OWNERSHIP"; completion: { assignee?: string } }
    | {
        type: "OPEN_WORK";
        completion: {
          currentStatus?: string;
          assignee?: string;
          disposition?: string;
        };
      }
    | {
        type: "RISK";
        completion: {
          risk?: string;
          mitigationOrRecovery?: string;
          requiresOwnerOrAcceptance: boolean;
          owner?: string;
          accepted?: boolean;
        };
      }
    | { type: "VERIFY"; completion: { succeeded: boolean } }
    | { type: "REFERENCE"; completion: { requiredAttachmentIds: string[] } }
  );

export interface HandoverSection {
  id: string;
  title: string;
  itemIds: string[];
  status?: SectionStatus;
}

export type SectionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "BLOCKED"
  | "SKIPPED"
  | "NOT_APPLICABLE";

export function sectionProgress(
  section: HandoverSection,
  items: readonly HandoverItem[],
): {
  status: SectionStatus;
  done: number;
  total: number;
  incomplete: string[];
} {
  const children = section.itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter(
      (item): item is HandoverItem =>
        item !== undefined &&
        (item.provenance.kind !== "SUGGESTED" ||
          item.provenance.decision !== "REJECTED"),
    );
  const applicable = children.filter(
    (item) => item.status !== "NOT_APPLICABLE",
  );
  const done = applicable.filter(
    (item) => item.status === "DONE" && evaluateItemCompletion(item).complete,
  ).length;
  const incomplete = applicable
    .filter(
      (item) =>
        item.status !== "DONE" || !evaluateItemCompletion(item).complete,
    )
    .map((item) => item.title);
  const status = section.status;
  if (status === "NOT_APPLICABLE")
    return { status, done: 0, total: 0, incomplete: [] };
  if (status === "BLOCKED" || status === "SKIPPED")
    return { status, done, total: applicable.length, incomplete };
  const derived: SectionStatus =
    applicable.length > 0 && incomplete.length === 0
      ? "COMPLETED"
      : children.some(
            (item) =>
              item.status !== "TODO" ||
              item.checklist.some((point) => point.covered),
          )
        ? "IN_PROGRESS"
        : "NOT_STARTED";
  return { status: derived, done, total: applicable.length, incomplete };
}

export interface HandoverPlan {
  id: string;
  sections: HandoverSection[];
  items: HandoverItem[];
  reviewedAt?: string;
}

export interface Transfer {
  schemaVersion: typeof transferSchemaVersion;
  id: string;
  project: { name: string; reference?: string };
  currentOwner: string;
  nextOwner?: string;
  targetDate?: string;
  plan: HandoverPlan;
  markdownSnapshot?: { metadata: string; items: Record<string, string> };
}

export function createTransfer(
  projectName: string,
  currentOwner: string,
): Transfer {
  return {
    schemaVersion: transferSchemaVersion,
    id: randomUUID(),
    project: { name: projectName },
    currentOwner,
    plan: { id: randomUUID(), sections: [], items: [] },
  };
}

export type CompletionReason =
  | "REQUIRED_POINT_UNCOVERED"
  | "CONFIRMATION_REQUIRED"
  | "ACTION_NOT_PERFORMED"
  | "ASSIGNEE_REQUIRED"
  | "STATUS_REQUIRED"
  | "DISPOSITION_OR_ASSIGNEE_REQUIRED"
  | "RISK_REQUIRED"
  | "MITIGATION_REQUIRED"
  | "OWNER_OR_ACCEPTANCE_REQUIRED"
  | "VERIFICATION_NOT_SUCCESSFUL"
  | "REFERENCE_REQUIRED";

export interface CompletionResult {
  complete: boolean;
  reasons: { code: CompletionReason; pointId?: string }[];
}

export function evaluateItemCompletion(item: HandoverItem): CompletionResult {
  const reasons: CompletionResult["reasons"] = [];
  if (item.type === "WALKTHROUGH") {
    for (const point of item.checklist) {
      if (point.required && !point.covered)
        reasons.push({ code: "REQUIRED_POINT_UNCOVERED", pointId: point.id });
    }
    if (!item.completion.confirmed)
      reasons.push({ code: "CONFIRMATION_REQUIRED" });
  } else if (item.type === "ACTION") {
    if (!item.completion.performed)
      reasons.push({ code: "ACTION_NOT_PERFORMED" });
  } else if (item.type === "OWNERSHIP") {
    if (!nonempty(item.completion.assignee))
      reasons.push({ code: "ASSIGNEE_REQUIRED" });
  } else if (item.type === "OPEN_WORK") {
    if (!nonempty(item.completion.currentStatus))
      reasons.push({ code: "STATUS_REQUIRED" });
    if (
      !nonempty(item.completion.assignee) &&
      !nonempty(item.completion.disposition)
    )
      reasons.push({ code: "DISPOSITION_OR_ASSIGNEE_REQUIRED" });
  } else if (item.type === "RISK") {
    if (!nonempty(item.completion.risk))
      reasons.push({ code: "RISK_REQUIRED" });
    if (!nonempty(item.completion.mitigationOrRecovery))
      reasons.push({ code: "MITIGATION_REQUIRED" });
    if (
      item.completion.requiresOwnerOrAcceptance &&
      !nonempty(item.completion.owner) &&
      item.completion.accepted !== true
    )
      reasons.push({ code: "OWNER_OR_ACCEPTANCE_REQUIRED" });
  } else if (item.type === "VERIFY") {
    if (!item.completion.succeeded)
      reasons.push({ code: "VERIFICATION_NOT_SUCCESSFUL" });
  } else if (item.type === "REFERENCE") {
    if (
      item.completion.requiredAttachmentIds.length === 0 ||
      item.completion.requiredAttachmentIds.some(
        (id) => !item.attachments.some((attachment) => attachment.id === id),
      )
    )
      reasons.push({ code: "REFERENCE_REQUIRED" });
  }
  return { complete: reasons.length === 0, reasons };
}

export function markItemDone(item: HandoverItem): HandoverItem {
  const result = evaluateItemCompletion(item);
  if (!result.complete)
    throw new Error(
      `Cannot complete item ${item.id}: ${result.reasons.map((reason) => reason.code).join(", ")}`,
    );
  return { ...item, status: "DONE" };
}

export function shouldAddSuggestion(
  plan: HandoverPlan,
  suggestionId: string,
): boolean {
  return !plan.items.some(
    (item) =>
      item.provenance.kind === "SUGGESTED" &&
      item.provenance.suggestionId === suggestionId,
  );
}

function nonempty(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}
