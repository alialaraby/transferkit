import { renderHandoverCoverageAudit } from "@transferkit/renderers";
import { summarizeHandoverCoverage } from "@transferkit/core";
import { runCli, type CliEnvironment } from "./cli.js";
import { manageBusinessFlow } from "./business-flows.js";
import { exportHandover } from "./export-handover.js";
import {
  addGuidedTopic,
  loadGuidedHandover,
  nextGuidedHandover,
  startGuidedHandover,
  statusGuidedHandover,
} from "./guided-handover.js";
import { runHandoverInterview } from "./interview-handover.js";
import { scanHandover } from "./scan-handover.js";

// Historical v2 tests exercise retained modules without restoring their public CLI routes.
export async function runLegacyCli(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  if (args[0] !== "handover") return runCli(args, environment);
  const output = { write: environment.stdout, read: environment.prompt };
  try {
    switch (args[1]) {
      case "flow":
        await manageBusinessFlow(environment.cwd, args[2] ?? "", output);
        return 0;
      case "scan":
        environment.stdout(
          JSON.stringify(
            { findings: await scanHandover(environment.cwd) },
            null,
            2,
          ),
        );
        return 0;
      case "start":
        await startGuidedHandover(environment.cwd, output);
        return 0;
      case "next":
      case "resume":
      case "revisit":
        await nextGuidedHandover(
          environment.cwd,
          output,
          args[1] === "revisit",
        );
        return 0;
      case "add-topic":
        await addGuidedTopic(environment.cwd, output);
        return 0;
      case "status":
        await statusGuidedHandover(environment.cwd, output);
        return 0;
      case "interview":
        if (!environment.prompt)
          throw new Error("Interactive input is unavailable");
        await runHandoverInterview(environment.cwd, {
          write: environment.stdout,
          read: environment.prompt,
        });
        return 0;
      case "audit":
        environment.stdout(
          renderHandoverCoverageAudit(
            summarizeHandoverCoverage(
              (await loadGuidedHandover(environment.cwd)).plan,
            ),
          ),
        );
        return 0;
      case "export":
        environment.stdout(
          `Generated ${await exportHandover(environment.cwd, { single: args[2] === "--single" })}`,
        );
        return 0;
      default:
        return runCli(args, environment);
    }
  } catch (error) {
    environment.stderr(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
