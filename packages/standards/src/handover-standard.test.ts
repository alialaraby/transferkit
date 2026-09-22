import { describe, expect, it } from "vitest";
import { detectKnowledgeGaps, type HandoverEntity } from "@transferkit/core";

import {
  handoverRequirements,
  planHandoverInterviewQuestions,
} from "./index.js";

describe("handover standards", () => {
  it("activates requirements only for discovered entity kinds", () => {
    const entities: HandoverEntity[] = [
      { id: "job:billing", kind: "scheduled-job", name: "BillingJob.run" },
    ];
    const gaps = detectKnowledgeGaps(entities, [], handoverRequirements);
    expect(gaps).toHaveLength(5);
    expect(
      gaps.every(({ requirementId }) =>
        requirementId.startsWith("scheduled-job."),
      ),
    ).toBe(true);
  });

  it("groups related critical knowledge and excludes already answered fields", () => {
    const entity: HandoverEntity = {
      id: "integration:stripe",
      kind: "integration",
      name: "Stripe",
    };
    const gaps = detectKnowledgeGaps(
      [entity],
      [{ entityId: entity.id, field: "businessImportance", value: "Payments" }],
      handoverRequirements,
    ).filter(({ priority }) => priority === "critical");
    const questions = planHandoverInterviewQuestions(gaps, [entity]);
    expect(questions).toHaveLength(2);
    expect(questions[0]?.requirementIds).toEqual(["integration.failure"]);
    expect(questions[1]?.requirementIds).toEqual([
      "integration.owner",
      "integration.credentials",
    ]);
  });

  it("plans questions across multiple supported domains with no absent-domain questions", () => {
    const entities: HandoverEntity[] = [
      { id: "database:postgresql", kind: "database", name: "PostgreSQL" },
      {
        id: "configuration:runtime",
        kind: "configuration",
        name: "Runtime configuration",
      },
    ];
    const gaps = detectKnowledgeGaps(entities, [], handoverRequirements).filter(
      ({ priority }) => priority === "critical",
    );
    const questions = planHandoverInterviewQuestions(gaps, entities);
    expect(questions.map(({ targetEntityId }) => targetEntityId)).toEqual([
      "configuration:runtime",
      "database:postgresql",
      "database:postgresql",
    ]);
    expect(questions.some(({ id }) => id.startsWith("integration."))).toBe(
      false,
    );
  });
});
