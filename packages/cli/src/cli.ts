import { packageName as corePackageName } from "@transferkit/core";
import { packageName as renderersPackageName } from "@transferkit/renderers";
import { packageName as scannersPackageName } from "@transferkit/scanners";
import { packageName as standardsPackageName } from "@transferkit/standards";
import {
  renderHandoverAudit,
  renderOnboardingPlan,
  renderOnboardingStatus,
} from "@transferkit/renderers";
import {
  buildOwnershipReadinessEvidence,
  isTaskStatus,
} from "@transferkit/core";

import { auditHandover } from "./audit-handover.js";
import { exportHandover } from "./export-handover.js";
import { initializeHandover } from "./initialize-handover.js";
import { runHandoverInterview } from "./interview-handover.js";
import { planOnboarding } from "./plan-onboarding.js";
import {
  loadOnboardingProgress,
  setOnboardingTaskStatus,
} from "./onboarding-progress.js";
import { scanHandover } from "./scan-handover.js";

export const packageName = "@transferkit/cli";
export const dependencies = [
  corePackageName,
  scannersPackageName,
  standardsPackageName,
  renderersPackageName,
] as const;

export interface CliEnvironment {
  cwd: string;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  prompt?: (message: string) => Promise<string>;
}

export async function runCli(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const singleExport =
    args.length === 3 &&
    args[0] === "handover" &&
    args[1] === "export" &&
    args[2] === "--single";
  const taskUpdate =
    args.length === 4 && args[0] === "onboard" && args[1] === "task";
  if (args.length === 1 && isHelpFlag(args[0])) {
    environment.stdout(usage);
    return 0;
  }

  if (
    args.length === 2 &&
    (args[0] === "handover" || args[0] === "onboard") &&
    isHelpFlag(args[1])
  ) {
    environment.stdout(args[0] === "handover" ? handoverUsage : onboardUsage);
    return 0;
  }

  if (
    !singleExport &&
    !taskUpdate &&
    (args.length !== 2 || (args[0] !== "handover" && args[0] !== "onboard"))
  ) {
    environment.stderr(usage);
    return 1;
  }

  try {
    if (args[0] === "onboard" && args[1] === "plan") {
      environment.stdout(
        renderOnboardingPlan(await planOnboarding(environment.cwd)),
      );
      return 0;
    }

    if (args[0] === "onboard" && args[1] === "status") {
      const plan = await planOnboarding(environment.cwd);
      const progress = await loadOnboardingProgress(environment.cwd, plan);
      environment.stdout(
        renderOnboardingStatus(
          plan,
          progress,
          buildOwnershipReadinessEvidence(plan, progress),
        ),
      );
      return 0;
    }

    if (taskUpdate) {
      const taskId = args[2];
      const status = args[3];
      if (taskId === undefined || !isTaskStatus(status)) {
        environment.stderr(onboardUsage);
        return 1;
      }
      const plan = await planOnboarding(environment.cwd);
      await setOnboardingTaskStatus(environment.cwd, plan, taskId, status);
      environment.stdout(`Updated ${taskId} to ${status}.`);
      return 0;
    }

    if (args[0] !== "handover") {
      environment.stderr(usage);
      return 1;
    }

    if (args[1] === "init") {
      const result = await initializeHandover(environment.cwd);
      const message =
        result.status === "initialized"
          ? `Initialized TransferKit in ${result.projectFile}`
          : `TransferKit is already initialized in ${result.projectFile}`;
      environment.stdout(message);
      return 0;
    }

    if (args[1] === "scan") {
      environment.stdout(
        JSON.stringify(
          { findings: await scanHandover(environment.cwd) },
          null,
          2,
        ),
      );
      return 0;
    }

    if (args[1] === "interview") {
      if (environment.prompt === undefined) {
        throw new Error("Interactive input is unavailable");
      }
      await runHandoverInterview(environment.cwd, {
        write: environment.stdout,
        read: environment.prompt,
      });
      return 0;
    }

    if (args[1] === "audit") {
      environment.stdout(
        renderHandoverAudit(await auditHandover(environment.cwd)),
      );
      return 0;
    }

    if (args[1] === "export") {
      environment.stdout(
        `Generated ${await exportHandover(environment.cwd, { single: singleExport })}`,
      );
      return 0;
    }

    environment.stderr(usage);
    return 1;
  } catch (error) {
    environment.stderr(`TransferKit failed: ${errorMessage(error)}`);
    return 1;
  }
}

const usage =
  "Usage: tk handover <init|scan|interview|audit|export> | tk onboard <plan|status|task>";
const handoverUsage =
  "Usage: tk handover <init|scan|interview|audit|export> [--single]";
const onboardUsage =
  "Usage: tk onboard <plan|status> | tk onboard task <task-id> <not-started|in-progress|completed|skipped>";

function isHelpFlag(value: string | undefined): boolean {
  return value === "--help" || value === "-h";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
