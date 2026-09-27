import { describe, expect, it } from "vitest";
import {
  createTransfer,
  evaluateItemCompletion,
  markItemDone,
  sectionProgress,
  shouldAddSuggestion,
  type HandoverItem,
} from "./transfer.js";
import {
  parseTransferState,
  serializeTransferState,
} from "./transfer-state.js";

const base = {
  id: "item-1",
  title: "Transfer task",
  priority: "CRITICAL" as const,
  status: "TODO" as const,
  checklist: [],
  attachments: [],
  repositoryContext: [],
  provenance: { kind: "MANUAL" as const },
};

const items: HandoverItem[] = [
  {
    ...base,
    type: "WALKTHROUGH",
    checklist: [
      { id: "point", text: "Cover it", required: true, covered: false },
    ],
    completion: { confirmed: false },
  },
  { ...base, type: "ACTION", completion: { performed: false } },
  { ...base, type: "OWNERSHIP", completion: {} },
  { ...base, type: "OPEN_WORK", completion: {} },
  { ...base, type: "RISK", completion: { requiresOwnerOrAcceptance: true } },
  { ...base, type: "VERIFY", completion: { succeeded: false } },
  { ...base, type: "REFERENCE", completion: { requiredAttachmentIds: [] } },
];

describe("Transfer v3 domain", () => {
  it("counts applicable children, keeps skipped work open, and excludes not-applicable work", () => {
    const action: HandoverItem = {
      ...base,
      type: "ACTION",
      completion: { performed: true },
      status: "DONE",
    };
    const skipped: HandoverItem = {
      ...base,
      id: "skipped",
      type: "ACTION",
      completion: { performed: false },
      status: "SKIPPED",
    };
    const notApplicable: HandoverItem = {
      ...base,
      id: "na",
      type: "ACTION",
      completion: { performed: false },
      status: "NOT_APPLICABLE",
    };
    const section = {
      id: "section",
      title: "Work",
      itemIds: [action.id, skipped.id, notApplicable.id],
    };
    expect(
      sectionProgress(section, [action, skipped, notApplicable]),
    ).toMatchObject({
      status: "IN_PROGRESS",
      done: 1,
      total: 2,
      incomplete: ["Transfer task"],
    });
    expect(
      sectionProgress({ ...section, status: "SKIPPED" }, [
        action,
        skipped,
        notApplicable,
      ]),
    ).toMatchObject({ status: "SKIPPED", done: 1, total: 2 });
    expect(
      sectionProgress({ ...section, status: "NOT_APPLICABLE" }, [
        action,
        skipped,
        notApplicable,
      ]),
    ).toMatchObject({ status: "NOT_APPLICABLE", done: 0, total: 0 });
  });
  it.each(items)(
    "rejects incomplete $type items even when DONE is requested",
    (item) => {
      expect(evaluateItemCompletion(item).complete).toBe(false);
      expect(evaluateItemCompletion(item).reasons.length).toBeGreaterThan(0);
      expect(() => markItemDone(item)).toThrow();
      const transfer = createTransfer("project", "owner");
      transfer.plan.sections = [
        { id: "section", title: "Work", itemIds: [item.id] },
      ];
      transfer.plan.items = [{ ...item, status: "DONE" }];
      expect(() => serializeTransferState(transfer)).toThrow(
        "Invalid Transfer state",
      );
    },
  );

  it("completes all seven types only with required evidence", () => {
    const complete: HandoverItem[] = [
      {
        ...base,
        type: "WALKTHROUGH",
        checklist: [
          { id: "point", text: "Cover it", required: true, covered: true },
        ],
        completion: { confirmed: true },
      },
      { ...base, type: "ACTION", completion: { performed: true } },
      { ...base, type: "OWNERSHIP", completion: { assignee: "next" } },
      {
        ...base,
        type: "OPEN_WORK",
        completion: { currentStatus: "open", disposition: "close" },
      },
      {
        ...base,
        type: "RISK",
        completion: {
          risk: "outage",
          mitigationOrRecovery: "restore",
          requiresOwnerOrAcceptance: true,
          accepted: true,
        },
      },
      { ...base, type: "VERIFY", completion: { succeeded: true } },
      {
        ...base,
        type: "REFERENCE",
        attachments: [{ id: "ref", kind: "URL", value: "https://example.com" }],
        completion: { requiredAttachmentIds: ["ref"] },
      },
    ];
    for (const item of complete) expect(markItemDone(item).status).toBe("DONE");
  });

  it("preserves IDs, reviewed order, decisions and completion across a round trip", () => {
    const transfer = createTransfer("project", "owner");
    transfer.plan.reviewedAt = "2026-09-27T00:00:00Z";
    transfer.plan.sections = [
      { id: "second", title: "Second", itemIds: ["rejected"] },
      { id: "first", title: "First", itemIds: ["accepted"] },
    ];
    transfer.plan.items = [
      {
        ...base,
        id: "accepted",
        type: "ACTION",
        status: "DONE",
        completion: { performed: true },
        provenance: {
          kind: "SUGGESTED",
          suggestionId: "scanner:accepted",
          decision: "ACCEPTED",
        },
      },
      {
        ...base,
        id: "rejected",
        type: "ACTION",
        completion: { performed: false },
        provenance: {
          kind: "SUGGESTED",
          suggestionId: "scanner:rejected",
          decision: "REJECTED",
        },
      },
    ];
    const loaded = parseTransferState(serializeTransferState(transfer));
    expect(loaded).toEqual(transfer);
    expect(shouldAddSuggestion(loaded.plan, "scanner:rejected")).toBe(false);
    expect(shouldAddSuggestion(loaded.plan, "scanner:new")).toBe(true);
  });

  it("rejects invalid structure and unsupported versions", () => {
    const transfer = createTransfer("project", "owner");
    expect(() =>
      parseTransferState(JSON.stringify({ ...transfer, schemaVersion: 2 })),
    ).toThrow("unsupported newer");
    expect(() =>
      parseTransferState(JSON.stringify({ ...transfer, schemaVersion: 0 })),
    ).toThrow("unsupported older");
    transfer.plan.sections = [
      { id: "section", title: "Work", itemIds: ["missing"] },
    ];
    expect(() => serializeTransferState(transfer)).toThrow(
      "Invalid Transfer state",
    );
  });
});
