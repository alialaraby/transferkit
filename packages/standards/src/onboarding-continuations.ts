import type {
  OnboardingQueueContinuation,
  OnboardingQueueEvidence,
  OnboardingTrace,
} from "@transferkit/core";

export function selectOnboardingContinuations(
  trace: OnboardingTrace | undefined,
  queues: OnboardingQueueEvidence,
): OnboardingQueueContinuation[] {
  if (!trace) return [];
  return queues.publications.flatMap((publication) => {
    const event = trace.methods
      .find((method) => method.symbol === publication.caller)
      ?.events.find(
        (item) =>
          item.kind === "call" &&
          item.at.file === publication.at.file &&
          item.at.line === publication.at.line,
      );
    if (!event) return [];
    const matches = queues.handlers.filter(
      (handler) => handler.queue === publication.queue,
    );
    return [
      {
        publication: { ...publication, path: event.path },
        ...(matches.length === 1
          ? { handler: matches[0]! }
          : {
              reason:
                matches.length === 0
                  ? "No matching WorkerHost registration was found."
                  : "Multiple WorkerHost registrations make the target ambiguous.",
            }),
      },
    ];
  });
}
