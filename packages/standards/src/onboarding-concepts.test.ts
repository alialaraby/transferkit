import { expect, it } from "vitest";
import type {
  OnboardingConceptEvidence,
  OnboardingTrace,
  OnboardingTraceLocation,
} from "@transferkit/core";

import { selectOnboardingConcepts } from "./onboarding-concepts.js";

const at: OnboardingTraceLocation = {
  file: "service.ts",
  line: 10,
  endLine: 10,
  origin: "code",
};

it("uses a custom repository method's declared result instead of its base entity", () => {
  const evidence: OnboardingConceptEvidence = {
    entities: ["Debt", "DebtGroup"].map((name) => ({
      name,
      declaration: at,
      fields: [],
      relations: [],
    })),
    repositories: [{ repository: "DebtRepository", entity: "Debt", at }],
    methodResults: [
      {
        repository: "DebtRepository",
        method: "findOrCreateGroup",
        entity: "DebtGroup",
        at,
      },
    ],
    injections: [
      {
        owner: "DebtService",
        property: "debtRepository",
        repository: "DebtRepository",
        at,
      },
    ],
  };
  const trace: OnboardingTrace = {
    id: "debt",
    entry: { symbol: "DebtService.create", declaration: at },
    methods: [
      {
        symbol: "DebtService.create",
        declaration: at,
        events: [
          {
            kind: "call",
            detail: "this.debtRepository.findOrCreateGroup",
            at,
            path: [],
            effect: "read-like",
          },
          {
            kind: "call",
            detail: "this.debtRepository.save",
            at: { ...at, line: 11 },
            path: [],
            effect: "write-like",
          },
        ],
      },
    ],
    calls: [
      {
        caller: "DebtService.create",
        site: at,
        kind: "declared-target",
        declaredTarget: "DebtRepository.findOrCreateGroup",
        path: [],
      },
      {
        caller: "DebtService.create",
        site: { ...at, line: 11 },
        kind: "unresolved",
        path: [],
      },
    ],
    gaps: [],
  };
  expect(
    selectOnboardingConcepts(trace, evidence).map((item) => [
      item.entity.name,
      item.calls[0]?.effect,
    ]),
  ).toEqual([
    ["Debt", "write-like"],
    ["DebtGroup", "unspecified"],
  ]);
});
