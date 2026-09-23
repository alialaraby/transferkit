import { describe, expect, it } from "vitest";

import {
  createHandoverState,
  parseHandoverState,
  serializeHandoverState,
} from "./index.js";

describe("handover state", () => {
  it("round-trips validated structured state", () => {
    const state = createHandoverState();
    state.entities.push({
      id: "messaging.consumer:shipments",
      kind: "messaging.consumer",
      name: "shipments",
    });
    state.knowledge.push({
      entityId: "messaging.consumer:shipments",
      field: "criticality",
      value: "critical",
    });

    expect(parseHandoverState(serializeHandoverState(state))).toEqual(state);
  });

  it("rejects invalid state", () => {
    expect(() => parseHandoverState('{"schemaVersion":2}')).toThrow(
      "unsupported newer schema version 2",
    );
  });
});
