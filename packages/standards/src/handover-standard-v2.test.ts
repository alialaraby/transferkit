import { describe, expect, it } from "vitest";
import { handoverStandardV2 } from "./handover-standard-v2.js";

describe("Handover Standard v2", () => {
  it("covers the 24 framework-independent ownership areas", () => {
    expect(handoverStandardV2.areas).toHaveLength(24);
    expect(handoverStandardV2.areas.map(({ title }) => title)).toContain(
      "Tribal Knowledge",
    );
    expect(handoverStandardV2.areas.map(({ title }) => title)).toContain(
      "Critical Business Flows",
    );
    expect(
      handoverStandardV2.areas.every(
        ({ requirements }) => requirements.length > 0,
      ),
    ).toBe(true);
  });

  it("retains critical, recommended, and optional requirements in a standard-first plan", () => {
    const priorities = handoverStandardV2.areas.flatMap(({ requirements }) =>
      requirements.map(({ priority }) => priority),
    );
    expect(new Set(priorities)).toEqual(
      new Set(["critical", "recommended", "optional"]),
    );
    expect(handoverStandardV2.areas[0]?.requirements[0]).toMatchObject({
      id: "system-overview.purpose",
      priority: "critical",
    });
  });
});
