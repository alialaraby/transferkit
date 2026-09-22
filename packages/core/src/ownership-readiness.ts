import type { OnboardingPlan } from "./onboarding-plan.js";
import type { OnboardingProgressState } from "./onboarding-progress.js";

export type OwnershipReadinessEvidenceStatus =
  "confirmed" | "pending" | "skipped" | "unresolved" | "unknown";

export interface OwnershipReadinessEvidenceItem {
  id: string;
  status: OwnershipReadinessEvidenceStatus;
  statement: string;
  relatedTaskId?: string;
  relatedEntityId?: string;
}

export interface OwnershipReadinessEvidence {
  items: OwnershipReadinessEvidenceItem[];
}

export function buildOwnershipReadinessEvidence(
  plan: OnboardingPlan,
  progress: OnboardingProgressState,
): OwnershipReadinessEvidence {
  const progressById = new Map(
    progress.tasks.map((task) => [task.taskId, task]),
  );
  const items: OwnershipReadinessEvidenceItem[] = [];
  if (plan.knowledgeMode === "repository-only") {
    items.push({
      id: "knowledge:human-handover",
      status: "unknown",
      statement:
        "Human handover knowledge is unavailable; evidence is repository-derived only.",
    });
  }
  for (const task of plan.stages.flatMap(({ tasks }) => tasks)) {
    const status = progressById.get(task.id)?.status ?? "not-started";
    items.push({
      id: `task:${task.id}`,
      status:
        status === "completed"
          ? "confirmed"
          : status === "skipped"
            ? "skipped"
            : "pending",
      statement:
        status === "completed"
          ? `Completed: ${task.title}`
          : status === "skipped"
            ? `Skipped: ${task.title}`
            : `${status === "in-progress" ? "In progress" : "Not completed"}: ${task.title}`,
      relatedTaskId: task.id,
      ...(task.relatedEntityId === undefined
        ? {}
        : { relatedEntityId: task.relatedEntityId }),
    });
  }
  items.push(
    ...plan.missingInformation.map(
      (missing): OwnershipReadinessEvidenceItem => ({
        id: `gap:${missing.id}`,
        status: "unresolved",
        statement: missing.message,
        relatedEntityId: missing.relatedEntityId,
      }),
    ),
  );
  return { items };
}
