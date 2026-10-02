import { packageName as corePackageName } from "@transferkit/core";
import { packageName as renderersPackageName } from "@transferkit/renderers";
import { packageName as scannersPackageName } from "@transferkit/scanners";
import { packageName as standardsPackageName } from "@transferkit/standards";
import {
  renderOnboardingPlan,
  renderOnboardingStatus,
  renderPersonalOnboardingPlan,
  renderPersonalOnboardingStatus,
} from "@transferkit/renderers";
import {
  buildOwnershipReadinessEvidence,
  isTaskStatus,
  parseOnboardingProgress,
  reconcileOnboardingProgress,
} from "@transferkit/core";
import { inspectEvidence } from "./evidence.js";
import { generateOnboardingGuide } from "./generate-onboarding-guide.js";
import { generateOnboardingWorkspace } from "./generate-onboarding-workspace.js";
import { readOnboardingV2View } from "./onboarding-v2-view.js";
import {
  setPersonalExerciseStatus,
  syncPersonalOnboarding,
} from "./personal-onboarding-sync.js";
import { initializeHandover } from "./initialize-handover.js";
import { planOnboarding } from "./plan-onboarding.js";
import {
  loadOnboardingProgress,
  onboardingProgressFileName,
  setOnboardingTaskStatus,
} from "./onboarding-progress.js";
import { planTransfer, refreshTransferSuggestions } from "./plan-transfer.js";
import { syncTransfer } from "./sync-transfer.js";
import { readTransferState } from "./transfer-state.js";
import { renderTransferStatus } from "./transfer-status.js";

export const packageName = "transferkit";
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
  const taskUpdate =
    args.length === 4 && args[0] === "onboard" && args[1] === "task";
  const planCommand =
    args[0] === "handover" && args[1] === "plan" && args.length >= 2;
  const focusedGuide =
    args.length === 4 &&
    args[0] === "onboard" &&
    args[1] === "guide" &&
    args[2] === "--focus" &&
    Boolean(args[3]);
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

  if (args[0] === "handover" && legacyHandoverCommands.has(args[1] ?? "")) {
    environment.stderr(
      "This command belongs to the legacy Handover workflow. Use: tk handover plan",
    );
    return 2;
  }

  if (
    !taskUpdate &&
    !planCommand &&
    !focusedGuide &&
    (args.length !== 2 || (args[0] !== "handover" && args[0] !== "onboard"))
  ) {
    environment.stderr(`Error: invalid command usage.\n\n${usage}`);
    return 2;
  }

  try {
    if (args[0] === "onboard" && args[1] === "guide") {
      environment.stdout(
        await generateOnboardingGuide(
          environment.cwd,
          focusedGuide ? { focus: args[3]! } : {},
        ),
      );
      return 0;
    }

    if (args[0] === "onboard" && args[1] === "workspace") {
      environment.stdout(await generateOnboardingWorkspace(environment.cwd));
      return 0;
    }

    if (args[0] === "onboard" && args[1] === "sync") {
      environment.stdout(await syncPersonalOnboarding(environment.cwd));
      return 0;
    }

    if (args[0] === "onboard" && args[1] === "plan") {
      const { view, fallbackHint } = await readOnboardingV2View(
        environment.cwd,
      );
      environment.stdout(
        view
          ? renderPersonalOnboardingPlan(view)
          : `Legacy onboarding plan\n\n${renderOnboardingPlan(await planOnboarding(environment.cwd))}\n\nOnboarding v2: ${fallbackHint}`,
      );
      return 0;
    }

    if (args[0] === "onboard" && args[1] === "status") {
      const { view, fallbackHint } = await readOnboardingV2View(
        environment.cwd,
      );
      if (view) {
        const legacySource = await optionalRead(
          join(environment.cwd, onboardingProgressFileName),
        );
        let legacy: string | undefined;
        if (legacySource !== undefined) {
          try {
            const plan = await planOnboarding(environment.cwd);
            const progress = reconcileOnboardingProgress(
              parseOnboardingProgress(legacySource),
              plan,
            );
            legacy = renderOnboardingStatus(
              plan,
              progress,
              buildOwnershipReadinessEvidence(plan, progress),
            );
          } catch (error) {
            legacy = `Legacy progress could not be read: ${diagnosticMessage(error)}`;
          }
        }
        environment.stdout(
          `${renderPersonalOnboardingStatus(view)}${legacy === undefined ? "" : `\n\nLegacy onboarding progress\n${legacy}`}`,
        );
      } else {
        const plan = await planOnboarding(environment.cwd);
        const progress = await loadOnboardingProgress(environment.cwd, plan);
        environment.stdout(
          `Legacy onboarding progress\n\n${renderOnboardingStatus(plan, progress, buildOwnershipReadinessEvidence(plan, progress))}\n\nOnboarding v2: ${fallbackHint}`,
        );
      }
      return 0;
    }

    if (taskUpdate) {
      const taskId = args[2];
      const status = args[3];
      if (taskId === undefined || !isTaskStatus(status)) {
        environment.stderr(`Error: invalid task status.\n\n${onboardUsage}`);
        return 2;
      }
      if (taskId.startsWith("v2:")) {
        environment.stdout(
          await setPersonalExerciseStatus(environment.cwd, taskId, status),
        );
        return 0;
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

    if (planCommand) {
      environment.stdout(
        await planTransfer(environment.cwd, args[2], args.slice(3)),
      );
      return 0;
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

    if (args[1] === "status") {
      const transfer = await readTransferState(environment.cwd);
      if (!transfer)
        throw new Error("No v3 Handover Plan found. Use: tk handover plan");
      environment.stdout(renderTransferStatus(transfer));
      return 0;
    }

    if (args[1] === "sync") {
      environment.stdout(await syncTransfer(environment.cwd));
      return 0;
    }

    if (args[1] === "scan") {
      const { transfer, findingsCount } = await refreshTransferSuggestions(
        environment.cwd,
      );
      const pending = transfer.plan.items.filter(
        (item) =>
          item.provenance.kind === "SUGGESTED" &&
          item.provenance.decision === "PENDING",
      ).length;
      environment.stdout(
        `Scanned repository: ${findingsCount} findings, ${pending} suggestions pending review. Use: tk handover plan`,
      );
      return 0;
    }

    if (args[1] === "evidence") {
      environment.stdout(await inspectEvidence(environment.cwd));
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
  handover   Build and track an ownership transfer
  onboard    Plan and track personal onboarding

Run 'tk handover --help' or 'tk onboard --help' for command details.`;
const handoverUsage = `Build and track a Handover Plan

Usage: tk handover <command>

Handover commands:
  init                 Initialize TransferKit handover state
  scan                 Analyze the repository and refresh suggestions
  plan [action ...]    Create or review the Handover Plan and HANDOVER.md
  sync                 Synchronize HANDOVER.md with Transfer state
  status               Show handover progress and remaining work
  evidence             Inspect repository evidence

Workflow: init → scan → plan → edit HANDOVER.md → sync → status`;
const legacyHandoverCommands = new Set([
  "start",
  "next",
  "resume",
  "revisit",
  "add-topic",
  "interview",
  "audit",
  "export",
  "flow",
]);
const onboardUsage = `Explore a repository and track your onboarding

Usage:
  tk onboard guide [--focus <route-or-symbol>]
  tk onboard workspace
  tk onboard sync
  tk onboard plan
  tk onboard status
  tk onboard task <task-id> <status>

Commands:
  guide     Generate the shared ONBOARDING.md from repository evidence
  workspace Create your personal .transferkit.local/ONBOARDING.md
  plan      Show your exercises and where to start
  status    Show progress, next exercise, and open questions
  sync      Import checkbox edits into personal progress
  task      Set status: not-started, in-progress, completed, or skipped

Start: guide → workspace → plan
As you work: edit your workspace → sync → status`;

async function optionalRead(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

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
import { readFile } from "node:fs/promises";
import { join } from "node:path";
