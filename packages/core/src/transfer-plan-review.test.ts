import { describe, expect, it } from "vitest";
import {
  addCustomHandoverItem,
  mergeSuggestedPlan,
  moveHandoverItem,
  reviewHandoverItem,
} from "./transfer-plan-review.js";
import { createTransfer, type HandoverPlan } from "./transfer.js";

function suggestions(): HandoverPlan {
  return {
    id: "new",
    sections: [{ id: "section", title: "Work", itemIds: ["a", "b"] }],
    items: ["a", "b"].map((key) => ({
      id: key,
      title: key,
      type: "ACTION" as const,
      priority: "CRITICAL" as const,
      status: "TODO" as const,
      checklist: [],
      attachments: [],
      repositoryContext: [{ path: `${key}.ts` }],
      provenance: {
        kind: "SUGGESTED" as const,
        suggestionId: key,
        decision: "PENDING" as const,
      },
      completion: { performed: false },
    })),
  };
}

describe("v3 review and rescan", () => {
  it("preserves rejection, title, priority, ordering, custom work and completion", () => {
    let plan = mergeSuggestedPlan(
      createTransfer("project", "owner").plan,
      suggestions(),
    );
    const a = plan.items.find((item) => item.title === "a")!;
    const b = plan.items.find((item) => item.title === "b")!;
    plan = reviewHandoverItem(plan, a.id, "accept");
    plan = reviewHandoverItem(plan, a.id, "rename", "Owner-reviewed title");
    plan = reviewHandoverItem(plan, a.id, "priority", "OPTIONAL");
    plan = reviewHandoverItem(plan, b.id, "reject");
    plan = moveHandoverItem(plan, a.id, plan.sections[0]!.id, 1);
    plan = addCustomHandoverItem(
      plan,
      plan.sections[0]!.id,
      "Manual action",
      "ACTION",
      "CRITICAL",
    );
    plan.items[0] = {
      ...plan.items[0]!,
      type: "ACTION",
      completion: { performed: true },
      status: "DONE",
    };
    const rescanned = mergeSuggestedPlan(plan, suggestions());
    expect(rescanned.items).toEqual(plan.items);
    expect(rescanned.sections).toEqual(plan.sections);
    expect(
      rescanned.items.find((item) => item.id === b.id)?.provenance,
    ).toMatchObject({ decision: "REJECTED" });
    expect(rescanned.items.find((item) => item.id === a.id)?.status).toBe(
      "DONE",
    );
  });
});
