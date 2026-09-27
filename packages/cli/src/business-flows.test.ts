import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, type CliEnvironment } from "./cli.js";
import { readHandoverState } from "./handover-state.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/realistic-nestjs",
);
async function project() {
  const directory = await mkdtemp(join(tmpdir(), "transferkit-flows-"));
  await cp(fixture, directory, { recursive: true });
  return directory;
}
async function command(cwd: string, args: string[], answers: string[] = []) {
  const output: string[] = [];
  const errors: string[] = [];
  const environment: CliEnvironment = {
    cwd,
    stdout: (message) => output.push(message),
    stderr: (message) => errors.push(message),
    prompt: async () => answers.shift() ?? "save",
  };
  const code = await runCli(args, environment);
  return { code, text: output.join("\n"), errors };
}

describe("business flow handover", () => {
  it("suggests starting points, confirms, renames, and documents a flow incrementally", async () => {
    const cwd = await project();
    const listed = await command(cwd, ["handover", "flow", "list"]);
    expect(listed.text).toContain("(suggested)");
    const id = listed.text.split(" · ")[0]!;
    expect(
      (await command(cwd, ["handover", "flow", "confirm"], [id])).code,
    ).toBe(0);
    await command(
      cwd,
      ["handover", "flow", "rename"],
      [id, "Shipment lifecycle"],
    );
    await command(
      cwd,
      ["handover", "flow", "document"],
      [id, "purpose", "Move shipments through fulfillment", "yes"],
    );
    const state = await readHandoverState(cwd);
    expect(state.guided?.flows?.find((flow) => flow.id === id)).toMatchObject({
      name: "Shipment lifecycle",
      status: "confirmed",
      details: { purpose: "Move shipments through fulfillment" },
    });
    const audit = await command(cwd, ["handover", "audit"]);
    expect(audit.text).toContain("Shipment lifecycle: Purpose (critical)");
    expect(audit.text).toContain(
      "Shipment lifecycle: Failure paths (critical)",
    );
    expect(audit.text).toContain("✓ covered (human)");
    expect(audit.text).toContain("✗ missing human knowledge");
  });

  it("supports manual flows and rejects irrelevant suggestions without inventing semantics", async () => {
    const cwd = await project();
    await command(cwd, ["handover", "flow", "add"], ["Payment settlement"]);
    const listed = await command(cwd, ["handover", "flow", "list"]);
    const suggestion = listed.text
      .split("\n")
      .find((line) => line.includes("(suggested)"))!
      .split(" · ")[0]!;
    await command(cwd, ["handover", "flow", "ignore"], [suggestion]);
    const state = await readHandoverState(cwd);
    expect(state.guided?.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Payment settlement",
          origin: "manual",
          status: "confirmed",
        }),
        expect.objectContaining({ id: suggestion, status: "irrelevant" }),
      ]),
    );
    const audit = await command(cwd, ["handover", "audit"]);
    expect(audit.text).toContain("Payment settlement: Purpose");
    expect(audit.text).not.toContain(`Flow from ${suggestion}: Purpose`);
  });
});
