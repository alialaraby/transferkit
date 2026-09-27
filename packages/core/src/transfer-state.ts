import { StateVersionError, readSchemaVersion } from "./state-version.js";
import {
  evaluateItemCompletion,
  sectionProgress,
  transferSchemaVersion,
  type Transfer,
} from "./transfer.js";

export function parseTransferState(contents: string): Transfer {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("Transfer state is not valid JSON");
  }
  return validateTransferState(value);
}

export function serializeTransferState(transfer: Transfer): string {
  validateTransferState(transfer);
  return `${JSON.stringify(transfer, null, 2)}\n`;
}

export function validateTransferState(value: unknown): Transfer {
  const version = readSchemaVersion(value, "Transfer state");
  if (version !== transferSchemaVersion)
    throw new StateVersionError(
      `Transfer state uses unsupported ${version > transferSchemaVersion ? "newer" : "older"} schema version ${version} (current: ${transferSchemaVersion})`,
    );
  if (
    !record(value) ||
    !id(value.id) ||
    !record(value.project) ||
    !text(value.project.name) ||
    !optionalText(value.project.reference) ||
    !text(value.currentOwner) ||
    !optionalText(value.nextOwner) ||
    !optionalDate(value.targetDate) ||
    !record(value.plan) ||
    !id(value.plan.id) ||
    !optionalDate(value.plan.reviewedAt) ||
    (value.markdownSnapshot !== undefined &&
      !snapshotValid(value.markdownSnapshot)) ||
    !Array.isArray(value.plan.sections) ||
    !Array.isArray(value.plan.items)
  )
    throw invalid();

  const sections = value.plan.sections as unknown[];
  const items = value.plan.items as unknown[];
  if (!sections.every(sectionValid) || !items.every(itemValid)) throw invalid();
  const sectionIds = sections.map((section) => (section as { id: string }).id);
  const itemIds = items.map((item) => (item as { id: string }).id);
  const orderedIds = sections.flatMap(
    (section) => (section as { itemIds: string[] }).itemIds,
  );
  if (
    new Set(sectionIds).size !== sectionIds.length ||
    new Set(itemIds).size !== itemIds.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.length !== itemIds.length ||
    orderedIds.some((itemId) => !itemIds.includes(itemId))
  )
    throw invalid();
  const suggestionIds = items.flatMap((item) => {
    const provenance = (
      item as { provenance: { kind: string; suggestionId?: string } }
    ).provenance;
    return provenance.kind === "SUGGESTED" ? [provenance.suggestionId] : [];
  });
  if (new Set(suggestionIds).size !== suggestionIds.length) throw invalid();
  if (
    sections.some((section) => {
      const candidate = section as Transfer["plan"]["sections"][number];
      return (
        candidate.status === "COMPLETED" &&
        sectionProgress(candidate, items as Transfer["plan"]["items"])
          .status !== "COMPLETED"
      );
    })
  )
    throw invalid();
  return value as unknown as Transfer;
}

function itemValid(value: unknown): boolean {
  if (
    !record(value) ||
    !id(value.id) ||
    !text(value.title) ||
    !oneOf(value.priority, ["CRITICAL", "RECOMMENDED", "OPTIONAL"]) ||
    !oneOf(value.status, [
      "TODO",
      "IN_PROGRESS",
      "BLOCKED",
      "DONE",
      "SKIPPED",
      "NOT_APPLICABLE",
    ]) ||
    !Array.isArray(value.checklist) ||
    !value.checklist.every(
      (point: unknown) =>
        record(point) &&
        id(point.id) &&
        text(point.text) &&
        typeof point.required === "boolean" &&
        typeof point.covered === "boolean",
    ) ||
    !uniqueIds(value.checklist) ||
    !Array.isArray(value.attachments) ||
    !value.attachments.every(
      (attachment: unknown) =>
        record(attachment) &&
        id(attachment.id) &&
        oneOf(attachment.kind, [
          "NOTE",
          "FILE",
          "URL",
          "COMMAND",
          "DOCUMENT",
          "CASE",
        ]) &&
        text(attachment.value),
    ) ||
    !uniqueIds(value.attachments) ||
    !Array.isArray(value.repositoryContext) ||
    !value.repositoryContext.every(
      (context: unknown) =>
        record(context) &&
        text(context.path) &&
        (context.line === undefined ||
          (Number.isInteger(context.line) && (context.line as number) > 0)) &&
        optionalText(context.description) &&
        optionalText(context.findingId),
    ) ||
    (value.notes !== undefined && typeof value.notes !== "string") ||
    !provenanceValid(value.provenance) ||
    !record(value.completion)
  )
    return false;
  const completion = value.completion;
  let valid = false;
  switch (value.type) {
    case "WALKTHROUGH":
      valid = typeof completion.confirmed === "boolean";
      break;
    case "ACTION":
      valid = typeof completion.performed === "boolean";
      break;
    case "OWNERSHIP":
      valid = optionalText(completion.assignee);
      break;
    case "OPEN_WORK":
      valid =
        optionalText(completion.currentStatus) &&
        optionalText(completion.assignee) &&
        optionalText(completion.disposition);
      break;
    case "RISK":
      valid =
        optionalText(completion.risk) &&
        optionalText(completion.mitigationOrRecovery) &&
        typeof completion.requiresOwnerOrAcceptance === "boolean" &&
        optionalText(completion.owner) &&
        (completion.accepted === undefined ||
          typeof completion.accepted === "boolean");
      break;
    case "VERIFY":
      valid = typeof completion.succeeded === "boolean";
      break;
    case "REFERENCE":
      valid =
        Array.isArray(completion.requiredAttachmentIds) &&
        completion.requiredAttachmentIds.every(id) &&
        new Set(completion.requiredAttachmentIds).size ===
          completion.requiredAttachmentIds.length;
      break;
  }
  if (!valid) return false;
  return (
    value.status !== "DONE" ||
    evaluateItemCompletion(
      value as unknown as Transfer["plan"]["items"][number],
    ).complete
  );
}

function sectionValid(value: unknown): boolean {
  return (
    record(value) &&
    id(value.id) &&
    text(value.title) &&
    (value.status === undefined ||
      oneOf(value.status, [
        "NOT_STARTED",
        "IN_PROGRESS",
        "COMPLETED",
        "BLOCKED",
        "SKIPPED",
        "NOT_APPLICABLE",
      ])) &&
    Array.isArray(value.itemIds) &&
    value.itemIds.every(id)
  );
}

function provenanceValid(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "MANUAL") return true;
  return (
    value.kind === "SUGGESTED" &&
    id(value.suggestionId) &&
    oneOf(value.decision, ["PENDING", "ACCEPTED", "REJECTED"]) &&
    optionalText(value.scannerId) &&
    optionalText(value.findingId)
  );
}

function uniqueIds(values: { id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}
function oneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === "string" && options.includes(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function id(value: unknown): value is string {
  return text(value);
}
function optionalText(value: unknown): boolean {
  return value === undefined || text(value);
}
function optionalDate(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "string" && !Number.isNaN(Date.parse(value)))
  );
}
function invalid(): Error {
  return new Error("Invalid Transfer state");
}

function snapshotValid(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.metadata === "string" &&
    record(value.items) &&
    Object.values(value.items).every((item) => typeof item === "string")
  );
}
