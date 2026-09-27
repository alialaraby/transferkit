#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { readFileSync, realpathSync } from "node:fs";
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
  const args = process.argv.slice(2);
  const interactiveCommand =
    args[0] === "handover" &&
    (["next", "resume", "revisit", "add-topic", "interview"].includes(
      args[1] ?? "",
    ) ||
      (args[1] === "flow" && args[2] !== "list"));
  const terminal =
    process.stdin.isTTY || !interactiveCommand
      ? createInterface({ input: process.stdin, output: process.stdout })
      : undefined;
  const pipedPrompt = !terminal
    ? createPipedPrompt(readFileSync(0, "utf8"))
    : undefined;

  try {
    process.exitCode = await runCli(args, {
      cwd: process.cwd(),
      stdout: console.log,
      stderr: console.error,
      prompt: (message) =>
        terminal ? terminal.question(message) : pipedPrompt!(message),
    });
  } finally {
    terminal?.close();
  }
}

export function createPipedPrompt(
  contents: string,
): (message: string) => Promise<string> {
  const answers = contents.split(/\r?\n/u);
  return async () => {
    const answer = answers.shift();
    if (answer === undefined || (answer === "" && answers.length === 0))
      throw new Error("No piped handover answer remains");
    return answer;
  };
}
