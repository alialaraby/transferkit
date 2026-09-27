import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTransfer } from "@transferkit/core";
import { readHandoverState } from "./handover-state.js";
import { readTransferState, writeTransferState } from "./transfer-state.js";

describe("Transfer state persistence", () => {
  it("writes atomically and leaves legacy files readable and untouched", async () => {
    const directory = await mkdtemp(join(tmpdir(), "transferkit-transfer-"));
    const legacy = '{"schemaVersion":1,"entities":[],"knowledge":[]}\n';
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(directory, ".transferkit"));
    await writeFile(join(directory, ".transferkit/handover.json"), legacy);
    await writeFile(
      join(directory, ".transferkit/project.yaml"),
      "project: old\n",
    );
    const transfer = createTransfer("project", "current");
    expect(await readTransferState(directory)).toBeUndefined();
    await writeTransferState(directory, transfer);
    expect(await readTransferState(directory)).toEqual(transfer);
    expect(await readdir(join(directory, ".transferkit"))).toEqual([
      "handover.json",
      "project.yaml",
      "transfer.json",
    ]);
    expect(
      await readFile(join(directory, ".transferkit/handover.json"), "utf8"),
    ).toBe(legacy);
    expect(await readHandoverState(directory)).toEqual({
      schemaVersion: 1,
      entities: [],
      knowledge: [],
    });
    expect(
      await readFile(join(directory, ".transferkit/project.yaml"), "utf8"),
    ).toBe("project: old\n");
  });
});
