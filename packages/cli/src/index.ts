#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";

import { packageName as corePackageName } from "@transferkit/core";
import { packageName as renderersPackageName } from "@transferkit/renderers";
import { packageName as scannersPackageName } from "@transferkit/scanners";
import { packageName as standardsPackageName } from "@transferkit/standards";

import { initializeHandover } from "./initialize-handover.js";
import { runHandoverInterview } from "./interview-handover.js";
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
  if (args[0] !== "handover" || args.length !== 2) {
    environment.stderr("Usage: tk handover <init|scan|interview>");
    return 1;
  }

  try {
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

    environment.stderr("Usage: tk handover <init|scan|interview>");
    return 1;
  } catch (error) {
    environment.stderr(`TransferKit failed: ${errorMessage(error)}`);
    return 1;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    process.exitCode = await runCli(process.argv.slice(2), {
      cwd: process.cwd(),
      stdout: console.log,
      stderr: console.error,
      prompt: (message) => terminal.question(message),
    });
  } finally {
    terminal.close();
  }
}
