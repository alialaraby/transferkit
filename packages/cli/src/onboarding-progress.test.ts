import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import {
  reconcileOnboardingProgress,
  type OnboardingPlan,
} from "@transferkit/core";

import { runCli, type CliEnvironment } from "./index.js";
import {
  loadOnboardingProgress,
  onboardingProgressFileName,
  setOnboardingTaskStatus,
} from "./onboarding-progress.js";
import { planOnboarding } from "./plan-onboarding.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/milestone-four",
);

describe("personal onboarding progress", () => {
  let directory: string;
  let plan: OnboardingPlan;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "transferkit-onboarding-"));
    await cp(fixture, directory, { recursive: true });
    plan = await planOnboarding(directory);
  });

  it("creates fresh personal state with every task not started", async () => {
    const progress = await loadOnboardingProgress(directory, plan);

    expect(progress.schemaVersion).toBe(1);
    expect(progress.tasks).toHaveLength(
      plan.stages.flatMap(({ tasks }) => tasks).length,
    );
    expect(progress.tasks.every(({ status }) => status === "not-started")).toBe(
      true,
    );
  });

  it("persists task completion with a timestamp", async () => {
    const taskId = firstTaskId(plan);
    await setOnboardingTaskStatus(
      directory,
      plan,
      taskId,
      "completed",
      new Date("2026-09-22T12:00:00.000Z"),
    );

    const stored = await loadOnboardingProgress(directory, plan);
    expect(stored.tasks.find((task) => task.taskId === taskId)).toEqual({
      taskId,
      status: "completed",
      completedAt: "2026-09-22T12:00:00.000Z",
    });
  });

  it("persists skipped tasks without a completion timestamp", async () => {
    const taskId = firstTaskId(plan);
    await setOnboardingTaskStatus(directory, plan, taskId, "skipped");

    expect(
      (await loadOnboardingProgress(directory, plan)).tasks.find(
        (task) => task.taskId === taskId,
      ),
    ).toEqual({ taskId, status: "skipped" });
  });

  it("survives a later CLI invocation", async () => {
    const taskId = firstTaskId(plan);
    expect(
      (await command(directory, ["onboard", "task", taskId, "in-progress"]))
        .exitCode,
    ).toBe(0);

    const resumed = await command(directory, ["onboard", "status"]);
    expect(resumed.stdout.join("\n")).toContain(
      `Next: Review PostgreSQL/TypeORM data layer (${taskId})`,
    );
  });

  it("preserves matching progress when a plan is regenerated", async () => {
    const taskId = firstTaskId(plan);
    await setOnboardingTaskStatus(directory, plan, taskId, "completed");

    const regenerated = await planOnboarding(directory);
    const progress = await loadOnboardingProgress(directory, regenerated);
    expect(progress.tasks.find((task) => task.taskId === taskId)?.status).toBe(
      "completed",
    );
  });

  it("starts newly generated tasks as incomplete", async () => {
    const progress = await loadOnboardingProgress(directory, plan);
    const expanded: OnboardingPlan = {
      ...plan,
      stages: [
        ...plan.stages,
        {
          id: "own-it",
          title: "Own It",
          tasks: [
            {
              id: "own-it:test:new-task",
              stage: "own-it",
              title: "Review a new responsibility",
            },
          ],
        },
      ],
    };

    expect(
      reconcileOnboardingProgress(progress, expanded).tasks.find(
        ({ taskId }) => taskId === "own-it:test:new-task",
      )?.status,
    ).toBe("not-started");
  });

  it("shows concise stage totals and the next task", async () => {
    const taskId = firstTaskId(plan);
    await setOnboardingTaskStatus(directory, plan, taskId, "completed");

    const result = await command(directory, ["onboard", "status"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout[0]).toContain("Understand the System   1/1");
    expect(result.stdout[0]).toContain("Run It                  0/2");
    expect(result.stdout[0]).toContain("Next:");
    expect(result.stdout[0]).not.toContain("%");
  });

  it("keeps personal state separate from shared handover state", async () => {
    await command(directory, ["onboard", "status"]);

    await expect(
      stat(join(directory, onboardingProgressFileName)),
    ).resolves.toBeDefined();
    await expect(stat(join(directory, ".transferkit"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const serialized = await readFile(
      join(directory, onboardingProgressFileName),
      "utf8",
    );
    expect(serialized).not.toContain("knowledge");
    expect(serialized).not.toContain("entities");
  });
});

function firstTaskId(plan: OnboardingPlan): string {
  const id = plan.stages[0]?.tasks[0]?.id;
  if (id === undefined) throw new Error("Expected an onboarding task");
  return id;
}

async function command(
  cwd: string,
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const environment: CliEnvironment = {
    cwd,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  };
  return { exitCode: await runCli(args, environment), stdout, stderr };
}
