import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readHandoverState, writeHandoverState } from "./handover-state.js";
import { scanHandover } from "./scan-handover.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/rabbitmq-consumers",
);

describe("scanHandover", () => {
  it("preserves knowledge for the same stable consumer across rescans", async () => {
    const directory = await copyFixture("single");
    await scanHandover(directory);
    const first = await readHandoverState(directory);
    const consumer = first.entities[0];
    expect(consumer).toBeDefined();
    first.knowledge.push({
      entityId: consumer?.id ?? "",
      field: "criticality",
      value: "critical",
    });
    await writeHandoverState(directory, first);

    await scanHandover(directory);

    expect((await readHandoverState(directory)).knowledge).toEqual(
      first.knowledge,
    );
  });

  it("does not attach existing knowledge to newly discovered consumers", async () => {
    const directory = await copyFixture("multiple");
    await writeHandoverState(directory, {
      schemaVersion: 1,
      entities: [],
      knowledge: [
        {
          entityId: "messaging.consumer:old",
          field: "operationalOwner",
          value: "Legacy team",
        },
      ],
    });

    await scanHandover(directory);
    const state = await readHandoverState(directory);

    expect(state.entities).toHaveLength(2);
    expect(
      state.entities.some(({ id }) =>
        state.knowledge.some(({ entityId }) => entityId === id),
      ),
    ).toBe(false);
    expect(state.knowledge[0]?.entityId).toBe("messaging.consumer:old");
  });

  it("is idempotent when a scan is repeated", async () => {
    const directory = await copyFixture("single");
    await scanHandover(directory);
    const first = await readHandoverState(directory);

    await scanHandover(directory);

    expect(await readHandoverState(directory)).toEqual(first);
  });
});

async function copyFixture(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-scan-"));
  await cp(join(fixtures, name), directory, { recursive: true });
  return directory;
}
