import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { discoverHandoverContextInAst } from "./handover-context.js";
import { scanOnboardingRepository, scanRepository } from "./index.js";
import { analyzeOnboardingRoutes } from "./onboarding-trace.js";
import { createTypeScriptAst } from "./typescript-ast.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/onboarding-deep-guide",
);

function traces() {
  const ast = createTypeScriptAst(fixture);
  const routes = discoverHandoverContextInAst(ast);
  return analyzeOnboardingRoutes(ast, routes);
}

describe("bounded onboarding traces", () => {
  it("shares the scanner's project while retaining existing findings", async () => {
    const selected = await scanOnboardingRepository(fixture, [
      "OrderController.submit",
      "OrderController.preview",
    ]);
    const regular = await scanRepository(fixture);
    expect(selected.traces).toHaveLength(2);
    expect(selected.loadedFiles).toBeGreaterThan(0);
    expect(selected.findings.map((finding) => finding.id)).toEqual(
      regular.map((finding) => finding.id),
    );
    expect(selected.concepts.entities.map((item) => item.name)).toEqual([
      "AccountEntity",
      "OrderEntity",
    ]);
    expect(selected.concepts.repositories).toContainEqual(
      expect.objectContaining({
        repository: "OrderRepository",
        entity: "OrderEntity",
      }),
    );
    expect(selected.concepts.entities[1]?.relations).toContainEqual(
      expect.objectContaining({
        property: "account",
        target: "AccountEntity",
        kind: "ManyToOne",
      }),
    );
  });

  it("reuses one scan context for two selected routes and cites declared targets", () => {
    expect(existsSync(join(fixture, "tsconfig.json"))).toBe(false);
    expect(existsSync(join(fixture, "node_modules"))).toBe(false);
    const ast = createTypeScriptAst(fixture);
    const routes = discoverHandoverContextInAst(ast).filter(
      (route) =>
        route.kind === "application.route" &&
        route.data.controller === "OrderController",
    );
    const results = analyzeOnboardingRoutes(ast, routes);
    expect(results).toHaveLength(2);
    expect(results.map((trace) => trace.entry.symbol)).toEqual([
      "OrderController.submit",
      "OrderController.preview",
    ]);
    for (const trace of results) {
      const edge = trace.calls.find(
        (call) => call.declaredTarget === "OrderService.create",
      );
      expect(edge?.site.file).toBe("controller.ts");
      expect(edge?.declaration?.file).toBe("service.ts");
      expect(edge?.kind).toBe("declared-target");
    }
    expect(ast.project.getSourceFiles()).toEqual(ast.sourceFiles);
  });

  it("keeps exits and exclusive writes separate, including repeated helper call sites", () => {
    const trace = traces().find(
      (item) => item.entry.symbol === "OrderController.submit",
    )!;
    const events = trace.methods.find(
      (method) => method.symbol === "OrderService.create",
    )!.events;
    const invalid = "when !input.valid at 44";
    expect(events.find((event) => event.kind === "throw")?.path).toContain(
      invalid,
    );
    expect(
      events.find((event) => event.kind === "throw")?.detail,
    ).not.toContain("invalid order");
    expect(
      events.filter(
        (event) =>
          event.path.includes(invalid) &&
          (event.kind === "call" || event.kind === "assignment"),
      ),
    ).toEqual([]);
    expect(events.find((event) => event.at.line === 48)?.path).toContain(
      "when input.priority at 47",
    );
    expect(events.find((event) => event.at.line === 50)?.path).toContain(
      "otherwise input.priority at 47",
    );
    expect(
      trace.calls
        .filter((edge) => edge.declaredTarget === "OrderService.recordAttempt")
        .map((edge) => edge.site.line),
    ).toEqual([52, 53]);
    expect(
      trace.calls.every(
        (edge) => edge.site.file !== "controller.ts" || edge.site.line >= 10,
      ),
    ).toBe(true);
  });

  it("labels local manager attempts and transaction calls without claiming outcomes", () => {
    const trace = traces().find(
      (item) => item.entry.symbol === "OrderController.submit",
    )!;
    const events = trace.methods.find(
      (method) => method.symbol === "OrderService.create",
    )!.events;
    expect(events.find((event) => event.at.line === 56)?.effect).toBe(
      "write-like",
    );
    expect(events.find((event) => event.at.line === 56)?.awaited).toBe(true);
    expect(events.find((event) => event.at.line === 57)?.effect).toBe(
      "transaction-like",
    );
    expect(events.find((event) => event.at.line === 59)?.path).toContain(
      "catch",
    );
    expect(events.filter((event) => event.at.line === 62)).toHaveLength(2);
    expect(
      events.find((event) => event.at.line === 65)?.effect,
    ).toBeUndefined();
    expect(trace.calls.find((edge) => edge.site.line === 56)?.kind).toBe(
      "unresolved",
    );
  });

  it("records unsupported constructs and a nested call without false edges", () => {
    const trace = traces().find(
      (item) => item.entry.symbol === "LimitsController.check",
    )!;
    expect(trace.methods.map((method) => method.symbol)).toEqual([
      "LimitsController.check",
      "LimitsController.value",
    ]);
    expect(trace.gaps.map((gap) => gap.reason)).toEqual(
      expect.arrayContaining([
        "Nested call target is known; argument evaluation order is not represented as a separate step.",
        "Call inside callback is not traced.",
        "Dynamic dispatch is unresolved.",
        "Unsupported control flow: ForStatement.",
        "Unsupported control flow: SwitchStatement.",
      ]),
    );
    const returnPath = trace.methods[0]!.events.find(
      (event) => event.kind === "return",
    )!.path;
    expect(returnPath).toContain("when mode === [literal] at 15");
    expect(
      trace.methods[0]!.events.filter(
        (event) => event.kind === "call" && event.path.includes(returnPath[0]!),
      ),
    ).toEqual([]);
    expect(
      trace.calls.some((edge) => edge.declaredTarget?.includes("Dispatcher")),
    ).toBe(false);
    expect(
      trace.calls.find(
        (edge) => edge.declaredTarget === "LimitsController.value",
      )?.evaluation,
    ).toBe("nested-argument");
  });

  it("keeps an inherited declaration unresolved", () => {
    const ast = createTypeScriptAst(fixture);
    const routes = discoverHandoverContextInAst(ast).filter(
      (route) => route.data.controller === "InheritedController",
    );
    const [trace] = analyzeOnboardingRoutes(ast, routes);
    expect(trace?.methods.map((method) => method.symbol)).toEqual([
      "InheritedController.run",
    ]);
    expect(trace?.calls[0]?.kind).toBe("unresolved");
    expect(
      trace?.gaps.some((gap) => gap.reason.includes("Inherited or overridden")),
    ).toBe(true);
  });

  it("exposes a traversal stop instead of silently omitting deeper methods", () => {
    const ast = createTypeScriptAst(fixture);
    const routes = discoverHandoverContextInAst(ast).filter(
      (route) => route.data.method === "submit",
    );
    const [trace] = analyzeOnboardingRoutes(ast, routes, { maxDepth: 0 });
    expect(trace?.methods.map((method) => method.symbol)).toEqual([
      "OrderController.submit",
    ]);
    expect(trace?.gaps.some((gap) => gap.reason.includes("Depth limit"))).toBe(
      true,
    );
    const [fileLimited] = analyzeOnboardingRoutes(ast, routes, { maxFiles: 1 });
    expect(
      fileLimited?.gaps.some((gap) => gap.reason.includes("Source file limit")),
    ).toBe(true);
    const [callLimited] = analyzeOnboardingRoutes(ast, routes, {
      maxCallsPerMethod: 0,
    });
    expect(
      callLimited?.gaps.some((gap) => gap.reason.includes("Call count limit")),
    ).toBe(true);
    const [projectLimited] = analyzeOnboardingRoutes(ast, routes, {
      maxProjectFiles: 1,
    });
    expect(projectLimited?.methods).toEqual([]);
    expect(
      projectLimited?.gaps.some((gap) =>
        gap.reason.includes("source-file budget"),
      ),
    ).toBe(true);
  });
});
