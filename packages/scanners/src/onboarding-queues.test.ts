import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { scanOnboardingRepository } from "./index.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/onboarding-phase4",
);

it("finds literal BullMQ publications and processor registrations but skips dynamic names", async () => {
  const result = await scanOnboardingRepository(fixture, [
    "ParcelController.dispatch",
  ]);
  expect(
    result.queues.publications.map((item) => [item.queue, item.job]),
  ).toEqual([
    ["parcel-jobs", "assign-parcel"],
    ["other-jobs", "archive-parcel"],
  ]);
  expect(result.queues.handlers.map((item) => item.queue)).toEqual([
    "parcel-jobs",
    "elsewhere",
  ]);
  expect(result.traces).toHaveLength(1);
});
