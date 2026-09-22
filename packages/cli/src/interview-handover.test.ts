import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { HandoverState } from "@transferkit/core";

import { readHandoverState, writeHandoverState } from "./handover-state.js";
import {
  runHandoverInterview,
  type InterviewIO,
} from "./interview-handover.js";

const entityId = "messaging.consumer:shipments";
const entity = {
  id: entityId,
  kind: "messaging.consumer" as const,
  name: "shipments",
};

describe("runHandoverInterview", () => {
  it("asks three grouped questions and persists all four missing fields", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [entity],
      knowledge: [],
    });
    const io = scriptedIo([
      "1",
      "It retries, then operators replay it",
      "Platform",
    ]);

    const result = await runHandoverInterview(directory, io);
    const state = await readHandoverState(directory);

    expect(result).toEqual({ status: "complete", answered: 3, skipped: 0 });
    expect(io.output).toContain("3 critical questions remain.");
    expect(io.output).toEqual(
      expect.arrayContaining([
        "Question 1 of 3",
        "Question 2 of 3",
        "Question 3 of 3",
      ]),
    );
    expect(state.knowledge).toEqual([
      { entityId, field: "criticality", value: "critical" },
      {
        entityId,
        field: "failureBehavior",
        value: "It retries, then operators replay it",
      },
      {
        entityId,
        field: "recoveryProcedure",
        value: "It retries, then operators replay it",
      },
      { entityId, field: "operationalOwner", value: "Platform" },
    ]);
  });

  it("asks only questions covering remaining critical gaps", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [entity],
      knowledge: [
        { entityId, field: "criticality", value: "important" },
        { entityId, field: "operationalOwner", value: "Messaging" },
      ],
    });
    const io = scriptedIo(["Dead-letters, then replay from the runbook"]);

    await runHandoverInterview(directory, io);

    expect(io.output[0]).toBe("1 critical question remains.");
    expect(io.output.join("\n")).not.toContain(
      "How critical is this consumer?",
    );
    expect((await readHandoverState(directory)).knowledge).toHaveLength(4);
  });

  it("does not prompt when there are no critical gaps", async () => {
    const directory = await projectWithState(completeState());
    const io = scriptedIo([]);

    const result = await runHandoverInterview(directory, io);

    expect(result.status).toBe("no-critical-gaps");
    expect(io.output).toEqual([
      "0 critical questions remain.",
      "No missing critical handover knowledge.",
    ]);
    expect(io.readCount).toBe(0);
  });

  it("leaves skipped questions as gaps for a safe rerun", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [entity],
      knowledge: [],
    });

    await runHandoverInterview(
      directory,
      scriptedIo(["skip", "Fails into a DLQ and is replayed", "Platform"]),
    );
    const rerun = scriptedIo(["important"]);
    await runHandoverInterview(directory, rerun);

    expect(rerun.output[0]).toBe("1 critical question remains.");
    expect((await readHandoverState(directory)).knowledge).toContainEqual({
      entityId,
      field: "criticality",
      value: "important",
    });
  });

  it("does not overwrite existing answers on rerun", async () => {
    const original = completeState();
    const directory = await projectWithState(original);
    const io = scriptedIo([]);

    await runHandoverInterview(directory, io);

    expect(await readHandoverState(directory)).toEqual(original);
  });

  it("limits a multi-domain session to four questions and offers continuation", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [
        { id: "job:billing", kind: "scheduled-job", name: "BillingJob.run" },
        { id: "database:postgresql", kind: "database", name: "PostgreSQL" },
        { id: "integration:stripe", kind: "integration", name: "Stripe" },
      ],
      knowledge: [],
    });
    const io = scriptedIo([
      "critical and customer-facing",
      "safe rerun",
      "Platform",
      "orders and payments",
    ]);

    const result = await runHandoverInterview(directory, io);

    expect(result).toEqual({ status: "complete", answered: 4, skipped: 0 });
    expect(io.readCount).toBe(4);
    expect(io.output[0]).toBe("7 critical questions remain.");
    expect(io.output).toContain(
      "3 critical questions remain. Run the interview again to continue.",
    );
  });

  it("safely resumes after cancellation without re-asking persisted answers", async () => {
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [entity],
      knowledge: [],
    });

    expect(
      await runHandoverInterview(directory, scriptedIo(["critical", "cancel"])),
    ).toEqual({ status: "cancelled", answered: 1, skipped: 0 });
    expect((await readHandoverState(directory)).knowledge).toContainEqual({
      entityId,
      field: "criticality",
      value: "critical",
    });

    const resumed = scriptedIo(["Fails safely and is replayed", "Platform"]);
    await runHandoverInterview(directory, resumed);

    expect(resumed.output[0]).toBe("2 critical questions remain.");
    expect(resumed.output.join("\n")).not.toContain(
      "How critical is this consumer?",
    );
    expect((await readHandoverState(directory)).knowledge).toHaveLength(4);
  });

  it("offers optional questions only after critical knowledge is complete", async () => {
    const job = {
      id: "job:billing",
      kind: "scheduled-job" as const,
      name: "BillingJob.run",
    };
    const directory = await projectWithState({
      schemaVersion: 1,
      entities: [job],
      knowledge: [
        { entityId: job.id, field: "criticality", value: "critical" },
        {
          entityId: job.id,
          field: "failureBehavior",
          value: "Billing is delayed",
        },
        {
          entityId: job.id,
          field: "recoveryProcedure",
          value: "Rerun once",
        },
        { entityId: job.id, field: "operationalOwner", value: "Platform" },
      ],
    });
    const io = scriptedIo(["no"]);

    await runHandoverInterview(directory, io);

    expect(io.output).toContain(
      "1 optional question remains. Continue? [yes/no]",
    );
    expect(io.output).toContain(
      "Optional questions deferred. Run the interview again to continue.",
    );
    expect((await readHandoverState(directory)).knowledge).toHaveLength(4);
  });
});

function completeState(): HandoverState {
  return {
    schemaVersion: 1,
    entities: [entity],
    knowledge: [
      { entityId, field: "criticality", value: "critical" },
      { entityId, field: "failureBehavior", value: "Dead-letters" },
      { entityId, field: "recoveryProcedure", value: "Replay the DLQ" },
      { entityId, field: "operationalOwner", value: "Platform" },
    ],
  };
}

async function projectWithState(state: HandoverState): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-interview-"));
  await writeHandoverState(directory, state);
  return directory;
}

function scriptedIo(answers: string[]): InterviewIO & {
  output: string[];
  readCount: number;
} {
  const output: string[] = [];
  let readCount = 0;
  return {
    output,
    get readCount() {
      return readCount;
    },
    write: (message) => output.push(message),
    read: async () => {
      const answer = answers[readCount];
      readCount += 1;
      if (answer === undefined) throw new Error("Unexpected prompt");
      return answer;
    },
  };
}
