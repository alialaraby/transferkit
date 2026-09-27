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

  it("round-trips guided progress while accepting earlier state without it", () => {
    const legacy = createHandoverState();
    expect(parseHandoverState(serializeHandoverState(legacy))).toEqual(legacy);
    const guided = {
      ...legacy,
      guided: {
        customTopics: [
          {
            id: "settlement",
            title: "Settlement",
            priority: "critical" as const,
          },
        ],
        skipped: ["operations.procedures"],
        notApplicable: ["scheduled-jobs.jobs"],
      },
    };
    expect(parseHandoverState(serializeHandoverState(guided))).toEqual(guided);
  });

  it("validates structured business-flow details", () => {
    const state = {
      ...createHandoverState(),
      guided: {
        customTopics: [],
        skipped: [],
        notApplicable: [],
        flows: [
          {
            id: "manual:payment",
            name: "Payment lifecycle",
            origin: "manual" as const,
            status: "confirmed" as const,
            details: {
              purpose: "Collect payment",
              failurePaths: "Callback may fail",
            },
          },
        ],
      },
    };
    expect(parseHandoverState(serializeHandoverState(state))).toEqual(state);
    const invalid = serializeHandoverState(state).replace(
      '"purpose":',
      '"invented":',
    );
    expect(() => parseHandoverState(invalid)).toThrow(
      "Invalid TransferKit handover state",
    );
  });
});
