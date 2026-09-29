import type {
  Finding,
  RouteTrace,
  RouteTraceOperation,
} from "@transferkit/core";
import {
  Node,
  SyntaxKind,
  type CallExpression,
  type ClassDeclaration,
  type MethodDeclaration,
} from "ts-morph";

import { sourceEvidence, type TypeScriptAst } from "./typescript-ast.js";
import type { HandoverContextFinding } from "./handover-context.js";

export type RouteTraceFinding = Finding<RouteTrace, "application.route-trace">;

export function discoverRouteTracesInAst(
  ast: TypeScriptAst,
  routes: readonly HandoverContextFinding[],
): RouteTraceFinding[] {
  const traces: RouteTraceFinding[] = [];
  for (const route of routes.filter(
    (item) => item.kind === "application.route",
  )) {
    const file = ast.project
      .getSourceFiles()
      .find(
        (source) =>
          sourceEvidence(ast, source).file === route.evidence[0]?.file,
      );
    const owner = file?.getClass(route.data.controller ?? "");
    const handler = owner?.getMethod(route.data.method ?? "");
    if (!owner || !handler?.getBody()) continue;
    const direct = handler
      .getBody()!
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => !insideNestedFunction(call, handler))
      .flatMap((call) => {
        const target = injectedCall(call, owner);
        const method = target?.declaration?.getMethod(target.method);
        return method?.getBody()
          ? [{ call, owner: target!.declaration!, method }]
          : [];
      });
    if (direct.length !== 1) continue;
    const { call, owner: service, method } = direct[0]!;
    const { operations, gaps } = inspectMethod(ast, service, method);
    traces.push({
      id: `route-trace:${route.id}`,
      kind: "application.route-trace",
      data: {
        routeFindingId: route.id,
        handler: `${owner.getName()}.${handler.getName()}`,
        serviceMethod: `${service.getName()}.${method.getName()}`,
        operations,
        gaps,
      },
      evidence: [sourceEvidence(ast, call), sourceEvidence(ast, method)],
    });
  }
  return traces;
}

function injectedCall(
  call: CallExpression,
  owner: ClassDeclaration,
):
  | { declaration?: ClassDeclaration; typeName: string; method: string }
  | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const receiver = expression.getExpression();
  if (
    !Node.isPropertyAccessExpression(receiver) ||
    receiver.getExpression().getText() !== "this"
  )
    return undefined;
  const parameter = owner
    .getConstructors()
    .flatMap((ctor) => ctor.getParameters())
    .find((item) => item.getName() === receiver.getName());
  const declaration = parameter
    ?.getType()
    .getSymbol()
    ?.getDeclarations()
    .find(Node.isClassDeclaration);
  if (!parameter) return undefined;
  return {
    ...(declaration ? { declaration } : {}),
    typeName:
      declaration?.getName() ?? parameter.getTypeNode()?.getText() ?? "",
    method: expression.getName(),
  };
}

function inspectMethod(
  ast: TypeScriptAst,
  owner: ClassDeclaration,
  method: MethodDeclaration,
): { operations: RouteTraceOperation[]; gaps: string[] } {
  const body = method.getBody()!;
  const ordered: { position: number; operation: RouteTraceOperation }[] = [];
  const gaps = new Set<string>();
  for (const branch of body.getDescendantsOfKind(SyntaxKind.IfStatement)) {
    if (insideNestedFunction(branch, method)) continue;
    const then = branch.getThenStatement();
    const throws =
      Node.isThrowStatement(then) ||
      (Node.isBlock(then) && then.getStatements().some(Node.isThrowStatement));
    const condition = compact(branch.getExpression().getText());
    const conditional = conditionsFor(branch, body);
    ordered.push({
      position: branch.getStart(),
      operation: {
        kind: throws ? "guard" : "branch",
        condition,
        ...(conditional ? { conditional } : {}),
        evidence: [sourceEvidence(ast, branch)],
      },
    });
  }
  for (const assignment of body.getDescendantsOfKind(
    SyntaxKind.BinaryExpression,
  )) {
    if (
      insideNestedFunction(assignment, method) ||
      assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken
    )
      continue;
    const left = assignment.getLeft();
    if (
      !Node.isPropertyAccessExpression(left) ||
      !/^(?:status|state|action)$/iu.test(left.getName())
    )
      continue;
    const conditional = conditionsFor(assignment, body);
    ordered.push({
      position: assignment.getStart(),
      operation: {
        kind: "assignment",
        target: left.getExpression().getText(),
        property: left.getName(),
        value: compact(assignment.getRight().getText()),
        ...(conditional ? { conditional } : {}),
        evidence: [sourceEvidence(ast, assignment)],
      },
    });
  }
  for (const call of body.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (insideNestedFunction(call, method)) {
      gaps.add("Calls inside nested callbacks are not ordered by this trace.");
      continue;
    }
    if (
      call
        .getAncestors()
        .some(
          (ancestor) =>
            Node.isCallExpression(ancestor) &&
            ancestor.getStart() >= body.getStart(),
        )
    ) {
      const nested = injectedCall(call, owner);
      if (nested)
        gaps.add(
          `Nested argument call ${nested.typeName}.${nested.method} is not ordered by this trace.`,
        );
      continue;
    }
    const expression = call.getExpression();
    if (
      Node.isElementAccessExpression(expression) &&
      expression.getExpression().getText().startsWith("this")
    ) {
      gaps.add(`Dynamic call ${compact(expression.getText())} is unresolved.`);
      continue;
    }
    if (Node.isIdentifier(expression)) {
      const declaration = expression.getSymbol()?.getDeclarations()[0];
      if (
        Node.isVariableDeclaration(declaration) &&
        declaration.getInitializer()?.getText().startsWith("this.")
      )
        gaps.add(
          `Indirect call through ${expression.getText()} is unresolved.`,
        );
      continue;
    }
    if (!Node.isPropertyAccessExpression(expression)) continue;
    const receiver = expression.getExpression();
    let category: RouteTraceOperation["category"] | undefined;
    let target: string | undefined;
    if (receiver.getText() === "this") {
      const local = owner.getMethod(expression.getName());
      if (
        /^(?:validate|check|assert|ensure)/iu.test(expression.getName()) &&
        local?.getBody()
      ) {
        category = "validation";
        target = owner.getName();
      } else if (local?.getBody()) {
        gaps.add(
          `Local helper ${owner.getName()}.${expression.getName()} is invoked but not traced.`,
        );
      }
    } else {
      const injected = injectedCall(call, owner);
      if (injected) {
        target = injected.typeName;
        if (/Repository$/u.test(target)) category = "repository";
        else if (
          /(?:Notification|Push|Mail|Email|Sms|Oss|S3|Client|Gateway|Audit)/iu.test(
            target,
          ) ||
          /^(?:record|notify|send|publish|emit|upload|request|post|put|delete|generate|ensureGenerated)/iu.test(
            injected.method,
          )
        )
          category = "service";
      }
    }
    if (!category || !target) continue;
    const conditions = conditionsFor(call, body);
    ordered.push({
      position: call.getEnd(),
      operation: {
        kind: "call",
        category,
        target,
        method: expression.getName(),
        ...(conditions ? { conditional: conditions } : {}),
        awaited: directlyAwaited(call),
        catchDepth: call
          .getAncestors()
          .filter(
            (ancestor) =>
              Node.isTryStatement(ancestor) &&
              contains(ancestor.getTryBlock(), call) &&
              ancestor.getCatchClause(),
          ).length,
        evidence: [sourceEvidence(ast, call)],
      },
    });
  }
  if (body.getDescendantsOfKind(SyntaxKind.CatchClause).length > 0)
    gaps.add(
      "Catch branches are present; their runtime outcomes and recovery behavior are unverified.",
    );
  gaps.add(
    "Effects beyond directly visible calls, including transaction boundaries and external delivery, are unverified.",
  );
  return {
    operations: ordered
      .sort((a, b) => a.position - b.position)
      .map((item) => item.operation),
    gaps: [...gaps],
  };
}

function insideNestedFunction(node: Node, method: MethodDeclaration): boolean {
  return node
    .getAncestors()
    .some(
      (ancestor) =>
        ancestor !== method &&
        (Node.isArrowFunction(ancestor) ||
          Node.isFunctionExpression(ancestor) ||
          Node.isFunctionDeclaration(ancestor) ||
          Node.isMethodDeclaration(ancestor)),
    );
}

function contains(parent: Node, child: Node): boolean {
  return (
    parent.getStart() <= child.getStart() && parent.getEnd() >= child.getEnd()
  );
}

function conditionsFor(node: Node, body: Node): string | undefined {
  const conditions = node
    .getAncestors()
    .filter(Node.isIfStatement)
    .filter(
      (branch) =>
        branch.getStart() >= body.getStart() &&
        (contains(branch.getThenStatement(), node) ||
          (branch.getElseStatement() !== undefined &&
            contains(branch.getElseStatement()!, node))),
    )
    .reverse()
    .map(
      (branch) =>
        `${contains(branch.getThenStatement(), node) ? "when" : "otherwise"} ${compact(branch.getExpression().getText())}`,
    );
  if (
    node
      .getAncestors()
      .some(
        (ancestor) =>
          Node.isCatchClause(ancestor) &&
          ancestor.getStart() >= body.getStart(),
      )
  )
    conditions.push("on caught error");
  return conditions.length ? conditions.join("; ") : undefined;
}

function directlyAwaited(call: CallExpression): boolean {
  let expression: Node = call;
  while (true) {
    const parent = expression.getParent();
    if (
      Node.isParenthesizedExpression(parent) ||
      Node.isAsExpression(parent) ||
      Node.isNonNullExpression(parent) ||
      Node.isTypeAssertion(parent)
    ) {
      expression = parent;
      continue;
    }
    return Node.isAwaitExpression(parent);
  }
}

function compact(value: string): string {
  return value.replace(/\s+/gu, " ").slice(0, 110);
}
