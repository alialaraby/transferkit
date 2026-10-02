import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { scanOnboardingRepository } from "../packages/scanners/dist/index.js";
import {
  explainCandidateFlows,
  understandProject,
} from "../packages/standards/dist/index.js";
import { renderOnboardingGuide } from "../packages/renderers/dist/index.js";

const [repository, ...entries] = process.argv.slice(2);
if (!repository || !entries.length)
  throw new Error(
    "Usage: node experiments/onboarding-phase2-benchmark.mjs <repository> <Controller.method> [...]",
  );

const start = performance.now();
const directory = resolve(repository);
const { findings, traces, loadedFiles } = await scanOnboardingRepository(
  directory,
  entries,
);
const model = understandProject(findings);
const guide = renderOnboardingGuide(
  model,
  findings,
  explainCandidateFlows(model, findings),
);
process.stdout.write(
  `${JSON.stringify(
    {
      elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(3)),
      guideBytes: Buffer.byteLength(guide),
      rssMiB: Number((process.memoryUsage().rss / 2 ** 20).toFixed(1)),
      peakRssMiB: Number(
        (
          process.resourceUsage().maxRSS /
          (process.platform === "darwin" ? 2 ** 20 : 1024)
        ).toFixed(1),
      ),
      loadedFiles,
      selectedRoutes: traces.length,
      traces: traces.map((trace) => ({
        entry: trace.entry.symbol,
        methods: trace.methods.map((method) => method.symbol),
        calls: trace.calls.length,
        gaps: trace.gaps.length,
        writeLikeSites: trace.methods.flatMap((method) =>
          method.events
            .filter((event) => event.effect === "write-like")
            .map((event) => `${event.at.file}:${event.at.line}`),
        ),
      })),
    },
    null,
    2,
  )}\n`,
);
