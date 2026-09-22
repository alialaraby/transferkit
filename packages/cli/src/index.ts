#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runCli } from "./cli.js";
export {
  dependencies,
  packageName,
  runCli,
  type CliEnvironment,
} from "./cli.js";

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  realpathSync(entryPoint) === realpathSync(fileURLToPath(import.meta.url))
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
