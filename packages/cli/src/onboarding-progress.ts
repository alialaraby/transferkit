import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createOnboardingProgress,
  parseOnboardingProgress,
  reconcileOnboardingProgress,
  serializeOnboardingProgress,
  updateOnboardingTaskProgress,
  type OnboardingPlan,
  type OnboardingProgressState,
  type OnboardingTaskStatus,
} from "@transferkit/core";

export const onboardingProgressFileName =
  ".transferkit.local/onboarding-progress.json";

export async function loadOnboardingProgress(
  workingDirectory: string,
  plan: OnboardingPlan,
): Promise<OnboardingProgressState> {
  const file = join(workingDirectory, onboardingProgressFileName);
  let state: OnboardingProgressState;
  try {
    state = parseOnboardingProgress(await readFile(file, "utf8"));
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw new Error(
        `Invalid TransferKit state in ${onboardingProgressFileName}`,
        { cause: error },
      );
    }
    state = createOnboardingProgress(plan);
  }
  const reconciled = reconcileOnboardingProgress(state, plan);
  await writeOnboardingProgress(workingDirectory, reconciled);
  return reconciled;
}

export async function setOnboardingTaskStatus(
  workingDirectory: string,
  plan: OnboardingPlan,
  taskId: string,
  status: OnboardingTaskStatus,
  completedAt = new Date(),
): Promise<OnboardingProgressState> {
  const state = await loadOnboardingProgress(workingDirectory, plan);
  const currentTaskIds = new Set(
    plan.stages.flatMap(({ tasks }) => tasks.map(({ id }) => id)),
  );
  if (!currentTaskIds.has(taskId)) {
    throw new Error(`Onboarding task not found in the current plan: ${taskId}`);
  }
  const updated = updateOnboardingTaskProgress(
    state,
    taskId,
    status,
    completedAt,
  );
  await writeOnboardingProgress(workingDirectory, updated);
  return updated;
}

async function writeOnboardingProgress(
  workingDirectory: string,
  state: OnboardingProgressState,
): Promise<void> {
  const file = join(workingDirectory, onboardingProgressFileName);
  const temporaryFile = `${file}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporaryFile, serializeOnboardingProgress(state), "utf8");
  await rename(temporaryFile, file);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
