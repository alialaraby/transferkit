export interface ProgressOutput {
  isTTY?: boolean;
  write(chunk: string): unknown;
}

const frames = ["|", "/", "-", "\\"];

export function startTerminalProgress(
  args: readonly string[],
  output: ProgressOutput,
): { stop(): void } {
  const label = progressLabel(args);
  if (!output.isTTY || !label) return { stop: () => undefined };

  let visible = false;
  let frame = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  const delay = setTimeout(() => {
    visible = true;
    const draw = () => {
      output.write(`\r\x1b[2K${frames[frame++ % frames.length]} ${label}`);
    };
    draw();
    interval = setInterval(draw, 100);
  }, 180);
  return {
    stop: () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
      if (visible) {
        output.write("\r\x1b[2K");
        visible = false;
      }
    },
  };
}

function progressLabel(args: readonly string[]): string | undefined {
  if (args[0] === "handover") {
    if (["scan", "evidence"].includes(args[1] ?? ""))
      return "Scanning repository...";
    if (args[1] === "plan" && args.length === 2)
      return "Preparing handover plan...";
  }
  if (args[0] === "onboard") {
    if (args[1] === "guide") return "Building onboarding guide...";
    if (["plan", "status"].includes(args[1] ?? ""))
      return "Preparing onboarding view...";
  }
  return undefined;
}
