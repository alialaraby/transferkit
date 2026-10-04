#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) {
  console.error("Usage: event-count <file.jsonl>");
  process.exitCode = 2;
} else {
  try {
    const lines = (await readFile(path, "utf8"))
      .split(/\r?\n/u)
      .filter(Boolean);
    const counts = new Map();
    for (const line of lines) {
      const event = JSON.parse(line);
      if (typeof event.type !== "string")
        throw new Error("Event type must be a string");
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
    for (const [type, count] of [...counts].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      console.log(`${type}: ${count}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
