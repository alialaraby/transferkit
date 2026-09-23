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
import { inspectEvidence } from "./evidence.js";
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
  if (args.length === 0 || (args.length === 1 && isHelpFlag(args[0]))) {
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
    environment.stderr(`Error: invalid command usage.\n\n${usage}`);
    return 2;
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
        environment.stderr(`Error: invalid task status.\n\n${onboardUsage}`);
        return 2;
      }
      const plan = await planOnboarding(environment.cwd);
      await setOnboardingTaskStatus(environment.cwd, plan, taskId, status);
      environment.stdout(`Updated ${taskId} to ${status}.`);
      return 0;
    }

    if (args[0] !== "handover") {
      environment.stderr(
        `Error: unknown command '${args[1]}'.\n\n${onboardUsage}`,
      );
      return 2;
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

    if (args[1] === "evidence") {
      environment.stdout(await inspectEvidence(environment.cwd));
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

    environment.stderr(
      `Error: unknown command '${args[1]}'.\n\n${handoverUsage}`,
    );
    return 2;
  } catch (error) {
    environment.stderr(`Error: ${diagnosticMessage(error)}`);
    return 1;
  }
}

const usage = `TransferKit — structured software ownership transfer

Usage:
  tk handover <command>
  tk onboard <command>

Commands:
  handover   Build and inspect shared handover knowledge
  onboard    Plan and track personal onboarding

Run 'tk handover --help' or 'tk onboard --help' for command details.`;
const handoverUsage = `Build and inspect handover knowledge

Usage: tk handover <command>

Commands:
  init                 Initialize .transferkit state
  scan                 Scan the repository and update discovered entities
  evidence             Show why repository findings were discovered
  interview            Capture missing handover knowledge
  audit                Report handover completeness
  export [--single]    Generate handover Markdown`;
const onboardUsage = `Plan and track onboarding

Usage:
  tk onboard plan
  tk onboard status
  tk onboard task <task-id> <status>

Commands:
  plan      Generate an onboarding plan
  status    Show onboarding progress
  task      Set status: not-started, in-progress, completed, or skipped`;

function isHelpFlag(value: string | undefined): boolean {
  return value === "--help" || value === "-h";
}

function diagnosticMessage(error: unknown): string {
  if (isNodeError(error)) {
    if (error.code === "EACCES" || error.code === "EPERM") {
      return `Permission denied${error.path === undefined ? "" : `: ${error.path}`}`;
    }
    if (error.code === "ENOENT") {
      return `Required file or directory not found${error.path === undefined ? "" : `: ${error.path}`}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
