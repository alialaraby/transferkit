import type { OnboardingPlan, OnboardingTask } from "./onboarding-plan.js";
import {
  currentSchemaVersion,
  requireCurrentSchemaVersion,
} from "./state-version.js";

export type OnboardingTaskStatus =
  "not-started" | "in-progress" | "completed" | "skipped";

export interface OnboardingTaskProgress {
  taskId: string;
  status: OnboardingTaskStatus;
  completedAt?: string;
}

export interface OnboardingProgressState {
  schemaVersion: 1;
  tasks: OnboardingTaskProgress[];
}

export function createOnboardingProgress(
  plan: OnboardingPlan,
): OnboardingProgressState {
  return {
    schemaVersion: 1,
    tasks: planTasks(plan).map(({ id }) => ({
      taskId: id,
      status: "not-started",
    })),
  };
}

export function reconcileOnboardingProgress(
  state: OnboardingProgressState,
  plan: OnboardingPlan,
): OnboardingProgressState {
  const existing = new Map(state.tasks.map((task) => [task.taskId, task]));
  const current = planTasks(plan).map(
    ({ id }): OnboardingTaskProgress =>
      existing.get(id) ?? { taskId: id, status: "not-started" },
  );
  const currentIds = new Set(current.map(({ taskId }) => taskId));
  return {
    schemaVersion: 1,
    tasks: [
      ...current,
      ...state.tasks.filter(({ taskId }) => !currentIds.has(taskId)),
    ],
  };
}

export function updateOnboardingTaskProgress(
  state: OnboardingProgressState,
  taskId: string,
  status: OnboardingTaskStatus,
  completedAt: Date,
): OnboardingProgressState {
  if (!state.tasks.some((task) => task.taskId === taskId)) {
    throw new Error(`Onboarding task not found: ${taskId}`);
  }
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.taskId !== taskId
        ? task
        : {
            taskId,
            status,
            ...(status === "completed"
              ? { completedAt: completedAt.toISOString() }
              : {}),
          },
    ),
  };
}

export function parseOnboardingProgress(
  contents: string,
): OnboardingProgressState {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("TransferKit onboarding progress is not valid JSON");
  }
  return migrateOnboardingProgress(value);
}

export function migrateOnboardingProgress(
  value: unknown,
): OnboardingProgressState {
  requireCurrentSchemaVersion(value, "TransferKit onboarding progress");
  if (!isOnboardingProgressState(value)) {
    throw new Error("Invalid TransferKit onboarding progress state");
  }
  return value;
}

export function serializeOnboardingProgress(
  state: OnboardingProgressState,
): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function planTasks(plan: OnboardingPlan): OnboardingTask[] {
  return plan.stages.flatMap(({ tasks }) => tasks);
}

function isOnboardingProgressState(
  value: unknown,
): value is OnboardingProgressState {
  return (
    isRecord(value) &&
    value.schemaVersion === currentSchemaVersion &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isOnboardingTaskProgress)
  );
}

function isOnboardingTaskProgress(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.taskId !== "string" ||
    !isTaskStatus(value.status)
  ) {
    return false;
  }
  return value.status === "completed"
    ? typeof value.completedAt === "string"
    : value.completedAt === undefined;
}

export function isTaskStatus(value: unknown): value is OnboardingTaskStatus {
  return (
    value === "not-started" ||
    value === "in-progress" ||
    value === "completed" ||
    value === "skipped"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
