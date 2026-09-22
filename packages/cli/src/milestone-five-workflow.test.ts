import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { runCli, type CliEnvironment } from "./index.js";
import { loadOnboardingProgress } from "./onboarding-progress.js";
import { planOnboarding } from "./plan-onboarding.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/project-detection/supported",
);

describe("Milestone 5 onboarding workflow", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "transferkit-milestone-five-"));
    await cp(fixture, directory, { recursive: true });
  });

  it("stays useful with only initialized and scanned repository knowledge", async () => {
    expect((await command(directory, ["handover", "init"])).exitCode).toBe(0);
    expect((await command(directory, ["handover", "scan"])).exitCode).toBe(0);

    const planned = await command(directory, ["onboard", "plan"]);
    expect(planned.exitCode).toBe(0);
    expect(planned.stdout[0]).toContain("Knowledge source: repository only");
    expect(planned.stdout[0]).toContain(
      "Locate the RabbitMQ consumer `shipment-webhooks`",
    );
    expect(planned.stdout[0]).toContain(
      "Trace the `shipment.updated` routing flow",
    );
    expect(planned.stdout[0]).not.toContain("Missing handover information");

    const plan = await planOnboarding(directory);
    const firstTask = plan.stages[0]?.tasks[0];
    if (firstTask === undefined) throw new Error("Expected onboarding task");
    expect(
      (await command(directory, ["onboard", "task", firstTask.id, "completed"]))
        .exitCode,
    ).toBe(0);

    const status = await command(directory, ["onboard", "status"]);
    expect(status.stdout[0]).toContain(`✓ Completed: ${firstTask.title}`);
    expect(status.stdout[0]).toContain(
      "? Human handover knowledge is unavailable",
    );
    expect(status.stdout[0]).not.toContain("qualified");
    expect(status.stdout[0]).not.toContain("%");
  });

  it("preserves progress through interview, partial handover, restart, and rescan", async () => {
    await command(directory, ["handover", "init"]);
    await command(directory, ["handover", "scan"]);
    const repositoryPlan = await planOnboarding(directory);
    const repositoryTask = repositoryPlan.stages[0]?.tasks[0];
    if (repositoryTask === undefined)
      throw new Error("Expected repository task");
    await command(directory, [
      "onboard",
      "task",
      repositoryTask.id,
      "completed",
    ]);

    const interview = await command(
      directory,
      ["handover", "interview"],
      ["1", "Dead-letters; replay from the DLQ", "skip"],
    );
    expect(interview.exitCode).toBe(0);

    const handoverPlan = await planOnboarding(directory);
    expect(handoverPlan.knowledgeMode).toBe("handover-aware");
    expect(handoverPlan.missingInformation).toEqual([
      expect.objectContaining({
        message:
          "Operational owner for shipment-webhooks was not documented during handover.",
      }),
    ]);
    const recoveryTask = handoverPlan.stages
      .flatMap(({ tasks }) => tasks)
      .find(({ id }) => id.includes("handover-recoveryProcedure"));
    if (recoveryTask === undefined) throw new Error("Expected recovery task");
    await command(directory, ["onboard", "task", recoveryTask.id, "completed"]);

    const resumed = await command(directory, ["onboard", "status"]);
    expect(resumed.stdout[0]).toContain(`✓ Completed: ${repositoryTask.title}`);
    expect(resumed.stdout[0]).toContain(`✓ Completed: ${recoveryTask.title}`);
    expect(resumed.stdout[0]).toContain(
      "✗ Operational owner for shipment-webhooks was not documented during handover.",
    );

    await command(directory, ["handover", "scan"]);
    const regenerated = await planOnboarding(directory);
    const persisted = await loadOnboardingProgress(directory, regenerated);
    expect(
      persisted.tasks.find(({ taskId }) => taskId === repositoryTask.id)
        ?.status,
    ).toBe("completed");
    expect(
      persisted.tasks.find(({ taskId }) => taskId === recoveryTask.id)?.status,
    ).toBe("completed");
  });
});

async function command(
  cwd: string,
  args: readonly string[],
  answers: readonly string[] = [],
): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let answer = 0;
  const environment: CliEnvironment = {
    cwd,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    prompt: async () => answers[answer++] ?? "",
  };
  return { exitCode: await runCli(args, environment), stdout, stderr };
}
