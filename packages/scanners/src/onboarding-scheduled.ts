import { relative } from "node:path";

import type {
  Finding,
  OnboardingScheduledCall,
  OnboardingTraceLocation,
} from "@transferkit/core";
import { Node, SyntaxKind } from "ts-morph";

import type { TypeScriptAst } from "./typescript-ast.js";

/** Direct calls in declared Nest scheduled handlers; callbacks and helpers remain unlinked. */
export function discoverOnboardingScheduledCallsInAst(
  ast: TypeScriptAst,
  findings: readonly Finding[],
): OnboardingScheduledCall[] {
  const files = new Map(
    ast.sourceFiles.map((file) => [
      relative(ast.repositoryDirectory, file.getFilePath()),
      file,
    ]),
  );
  const at = (node: Node): OnboardingTraceLocation => ({
    file: relative(ast.repositoryDirectory, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    origin: "code",
  });
  const calls: OnboardingScheduledCall[] = [];
  for (const finding of findings.filter(
    (item) => item.kind === "scheduled-job",
  )) {
    const data = finding.data as Record<string, unknown>;
    const name = data.name;
    if (typeof name !== "string") continue;
    const [ownerName, methodName] = name.split(".");
    const registration = finding.evidence[0];
    if (!ownerName || !methodName || !registration) continue;
    const method = files
      .get(registration.file)
      ?.getClass(ownerName)
      ?.getMethod(methodName);
    if (!method?.getBody()) continue;
    for (const call of method
      .getBody()!
      .getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (
        call
          .getAncestors()
          .some(
            (ancestor) =>
              Node.isArrowFunction(ancestor) ||
              Node.isFunctionExpression(ancestor),
          )
      )
        continue;
      const access = call.getExpression();
      if (!Node.isPropertyAccessExpression(access)) continue;
      const receiver = access.getExpression();
      if (
        !Node.isPropertyAccessExpression(receiver) ||
        receiver.getExpression().getText() !== "this"
      )
        continue;
      const action = access.getName();
      const effect = /^(?:save|insert|update|remove|delete)$/u.test(action)
        ? "write-like"
        : /^(?:find|findOne|findBy|count)$/u.test(action)
          ? "read-like"
          : undefined;
      calls.push({
        job: name,
        ...(typeof data.schedule === "string" ||
        typeof data.schedule === "number"
          ? { schedule: String(data.schedule) }
          : {}),
        registration: {
          file: registration.file,
          line: registration.line ?? 1,
          endLine: registration.line ?? 1,
          origin: "code",
        },
        at: at(call),
        detail: access.getText(),
        ...(effect ? { effect } : {}),
      });
    }
  }
  return calls;
}
