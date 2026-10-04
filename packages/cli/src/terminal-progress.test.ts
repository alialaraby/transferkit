import { afterEach, describe, expect, it, vi } from "vitest";

import { startTerminalProgress } from "./terminal-progress.js";

afterEach(() => vi.useRealTimers());

describe("terminal progress", () => {
  it("shows delayed progress for a long guide operation and clears it", () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const progress = startTerminalProgress(["onboard", "guide"], {
      isTTY: true,
      write: (chunk) => chunks.push(chunk),
    });
    vi.advanceTimersByTime(179);
    expect(chunks).toEqual([]);
    vi.advanceTimersByTime(201);
    expect(chunks.join("")).toContain("Building onboarding guide...");
    progress.stop();
    const afterStop = chunks.length;
    expect(chunks.at(-1)).toBe("\r\x1b[2K");
    vi.advanceTimersByTime(500);
    expect(chunks).toHaveLength(afterStop);
  });

  it("keeps redirected output and quick commands clean", () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const output = { write: (chunk: string) => chunks.push(chunk) };
    startTerminalProgress(["handover", "scan"], output);
    startTerminalProgress(["handover", "status"], {
      ...output,
      isTTY: true,
    });
    vi.advanceTimersByTime(500);
    expect(chunks).toEqual([]);
  });
});
