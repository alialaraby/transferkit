import { expect, it } from "vitest";

import type {
  OnboardingConceptEvidence,
  OnboardingQueueEvidence,
  OnboardingStoryInventory,
  OnboardingTrace,
} from "@transferkit/core";

import { selectOnboardingStories } from "./onboarding-story-selection.js";

const location = (line: number) => ({
  file: "src/shipments.ts",
  line,
  endLine: line,
  origin: "code" as const,
});
const concepts: OnboardingConceptEvidence = {
  entities: [],
  repositories: [],
  methodResults: [],
  injections: [],
};
const queues: OnboardingQueueEvidence = { publications: [], handlers: [] };
const inventory: OnboardingStoryInventory = {
  roles: [],
  entries: [],
  artifacts: [],
  outputs: [],
  boundaries: [],
  observations: [],
  terms: [
    {
      name: "Shipment",
      codeRole: "declared data entity",
      evidence: [{ file: "src/shipment.entity.ts", line: 1 }],
      relationCount: 2,
      relations: [],
    },
  ],
  rejectedDescriptions: [],
  unknowns: [],
};

function trace(symbol: string, line: number, detail: string): OnboardingTrace {
  return {
    id: symbol,
    entry: {
      symbol,
      kind: "route",
      verb: "POST",
      declaration: location(line),
    },
    methods: [
      {
        symbol,
        declaration: location(line),
        events: [
          {
            kind: "branch",
            detail,
            at: location(line + 1),
            path: [],
          },
        ],
      },
    ],
    calls: [],
    gaps: [],
  };
}

it("selects creation and assignment as distinct entries without inventing a sequence", () => {
  const creation = trace(
    "ShipmentController.createShipment",
    10,
    "if duplicate",
  );
  creation.gaps.push({
    reason: "Nested Promise body is not traced.",
    at: location(12),
    path: [],
  });
  const assignment = trace(
    "FleetController.assignShipment",
    30,
    "if unavailable",
  );
  const result = selectOnboardingStories(
    [assignment, creation],
    inventory,
    concepts,
    queues,
  );
  expect(result.chapters.map((item) => item.id)).toEqual([
    "ShipmentController.createShipment",
    "FleetController.assignShipment",
  ]);
  expect(result.chapters[0]?.firstUnsupportedBoundary?.reason).toContain(
    "Nested Promise",
  );
  expect(result.connections).toContainEqual(
    expect.objectContaining({ kind: "unproven-association" }),
  );
  expect(result.connections.some((item) => item.kind === "direct-call")).toBe(
    false,
  );
});

it("preserves an explicit focus and labels a matched queue as possible only", () => {
  const creation = trace(
    "ShipmentController.createShipment",
    10,
    "if duplicate",
  );
  creation.methods[0]!.events.push({
    kind: "call",
    detail: "queue.add",
    at: location(15),
    path: [],
  });
  const assignment = trace(
    "FleetController.assignShipment",
    30,
    "if unavailable",
  );
  const result = selectOnboardingStories(
    [creation, assignment],
    inventory,
    concepts,
    {
      publications: [
        {
          caller: creation.entry.symbol,
          queue: "shipment-jobs",
          job: "assign",
          at: location(15),
          injection: location(9),
        },
      ],
      handlers: [
        {
          queue: "shipment-jobs",
          symbol: "ShipmentWorker.process",
          registration: location(40),
          declaration: location(41),
        },
      ],
    },
    assignment.entry.symbol,
  );
  expect(result.chapters[0]?.id).toBe(assignment.entry.symbol);
  expect(result.chapters[0]?.role).toBe("focused");
  expect(result.connections).toContainEqual(
    expect.objectContaining({
      kind: "possible-async-continuation",
      to: "ShipmentWorker.process",
    }),
  );
  expect(
    result.connections.find((item) => item.to === "ShipmentWorker.process")
      ?.explanation,
  ).toContain("unverified");
});

it("uses documented command input and output when deep tracing is unavailable", () => {
  const evidence = [{ file: "README.md", line: 3 }];
  const commandInventory: OnboardingStoryInventory = {
    ...inventory,
    entries: [
      {
        kind: "entry",
        name: "event-count",
        text: "The event-count command enters at src/cli.js.",
        basis: "code-observation",
        evidence,
      },
    ],
    artifacts: [
      {
        kind: "artifact",
        text: "The command reads a JSONL file.",
        basis: "repository-statement",
        evidence,
      },
    ],
    outputs: [
      {
        kind: "output",
        text: "The command prints sorted counts.",
        basis: "repository-statement",
        evidence,
      },
    ],
  };
  const result = selectOnboardingStories(
    [],
    commandInventory,
    concepts,
    queues,
  );
  expect(result.chapters[0]?.id).toBe("event-count");
  expect(result.chapters[0]?.input?.text).toContain("JSONL");
  expect(result.chapters[0]?.output?.text).toContain("counts");
  expect(result.chapters[0]?.firstUnsupportedBoundary?.reason).toContain(
    "No supported source trace",
  );
});

it("keeps an explicitly focused empty handler visible as an unverified source entry", () => {
  const empty = trace("ShipmentController.inspectShipment", 70, "unused");
  empty.methods[0]!.events = [];
  const result = selectOnboardingStories(
    [empty],
    inventory,
    concepts,
    queues,
    empty.entry.symbol,
  );
  expect(result.chapters[0]?.id).toBe(empty.entry.symbol);
  expect(result.chapters[0]?.role).toBe("focused");
  expect(result.chapters[0]?.decision).toBeUndefined();
});

it("keeps a prose-only relationship separate from a proven call", () => {
  const documented: OnboardingStoryInventory = {
    ...inventory,
    purpose: {
      kind: "purpose",
      text: "ShipmentController.createShipment and FleetController.assignShipment are related workflows.",
      basis: "repository-statement",
      evidence: [{ file: "README.md", line: 4 }],
    },
  };
  const result = selectOnboardingStories(
    [
      trace("ShipmentController.createShipment", 10, "if duplicate"),
      trace("FleetController.assignShipment", 30, "if unavailable"),
    ],
    documented,
    concepts,
    queues,
  );
  expect(result.connections).toContainEqual(
    expect.objectContaining({
      kind: "documented-relation",
      evidence: [{ file: "README.md", line: 4 }],
    }),
  );
  expect(result.connections.some((item) => item.kind === "direct-call")).toBe(
    false,
  );
});
