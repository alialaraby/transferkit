import { relative, sep } from "node:path";

import type {
  OnboardingTrace,
  OnboardingTraceCallEdge,
  OnboardingTraceEvent,
  OnboardingTraceGap,
  OnboardingTraceLocation,
  OnboardingTraceMethod,
} from "@transferkit/core";
import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type CallExpression,
  type Expression,
  type MethodDeclaration,
  type Statement,
} from "ts-morph";

import type { HandoverContextFinding } from "./handover-context.js";
import type { TypeScriptAst } from "./typescript-ast.js";

export interface OnboardingTraceLimits {
  maxEntries: number;
  maxProjectFiles: number;
  maxMethods: number;
  maxDepth: number;
  maxCallsPerMethod: number;
  maxFiles: number;
  maxPaths: number;
}

const defaultLimits: OnboardingTraceLimits = {
  maxEntries: 3,
  maxProjectFiles: 5000,
  maxMethods: 40,
  maxDepth: 3,
  maxCallsPerMethod: 30,
  maxFiles: 30,
  maxPaths: 16,
};

type PathState = { path: string[]; aliases: Map<string, "query-runner"> };

/** Uses the scan's existing ts-morph Project; it never creates another Program. */
export function analyzeOnboardingRoutes(
  ast: TypeScriptAst,
  routes: readonly HandoverContextFinding[],
  options: Partial<OnboardingTraceLimits> = {},
): OnboardingTrace[] {
  const limits = { ...defaultLimits, ...options };
  const files = new Map(
    ast.sourceFiles.map((file) => [
      relative(ast.repositoryDirectory, file.getFilePath()),
      file,
    ]),
  );
  const traces: OnboardingTrace[] = [];
  for (const route of routes.filter(
    (item) => item.kind === "application.route",
  )) {
    if (traces.length >= limits.maxEntries) break;
    const file = files.get(route.evidence[0]?.file ?? "");
    const owner = file?.getClass(route.data.controller ?? "");
    const handler = owner?.getMethod(route.data.method ?? "");
    if (!handler?.getBody()) continue;
    const entrySymbol = symbolName(handler);
    const trace: OnboardingTrace = {
      id: [
        route.data.verb,
        route.data.path ?? "",
        route.evidence[0]?.file,
        entrySymbol,
      ]
        .filter(Boolean)
        .join(":"),
      entry: {
        symbol: entrySymbol,
        kind: route.data.entryKind === "scheduled" ? "scheduled" : "route",
        ...(route.data.verb ? { verb: route.data.verb } : {}),
        ...(route.data.path ? { path: route.data.path } : {}),
        ...(route.data.schedule ? { schedule: route.data.schedule } : {}),
        declaration: location(ast, handler),
      },
      methods: [],
      calls: [],
      gaps: [],
    };
    if (ast.sourceFiles.length > limits.maxProjectFiles) {
      addGap(
        trace,
        ast,
        handler,
        [],
        "Project source-file budget reached before tracing.",
      );
      traces.push(trace);
      continue;
    }
    const analyzed = new Set<MethodDeclaration>();
    const visitedFiles = new Set<string>();
    const analyze = (method: MethodDeclaration, depth: number): void => {
      if (analyzed.has(method)) return;
      if (depth > limits.maxDepth) {
        addGap(trace, ast, method, [], "Method depth limit reached.");
        return;
      }
      if (trace.methods.length >= limits.maxMethods) {
        addGap(trace, ast, method, [], "Method count limit reached.");
        return;
      }
      const fileName = relative(
        ast.repositoryDirectory,
        method.getSourceFile().getFilePath(),
      );
      if (!isLocalSource(fileName)) {
        addGap(
          trace,
          ast,
          method,
          [],
          "Method body is outside supported source.",
        );
        return;
      }
      if (!visitedFiles.has(fileName) && visitedFiles.size >= limits.maxFiles) {
        addGap(trace, ast, method, [], "Source file limit reached.");
        return;
      }
      visitedFiles.add(fileName);
      analyzed.add(method);
      const body = method.getBody();
      if (!body || !Node.isBlock(body)) {
        addGap(trace, ast, method, [], "Method body is unavailable.");
        return;
      }
      const result: OnboardingTraceMethod = {
        symbol: symbolName(method),
        declaration: location(ast, method),
        events: [],
      };
      trace.methods.push(result);
      let callCount = 0;
      const event = (
        kind: OnboardingTraceEvent["kind"],
        node: Node,
        state: PathState,
        detail: string,
        extra: Pick<OnboardingTraceEvent, "awaited" | "effect"> = {},
      ): void => {
        result.events.push({
          kind,
          detail,
          at: location(ast, node),
          path: [...state.path],
          ...extra,
        });
      };
      const gap = (node: Node, state: PathState, reason: string): void => {
        addGap(trace, ast, node, state.path, reason);
      };
      const inspectExpression = (expression: Node, state: PathState): void => {
        const shortCircuit = [
          ...(Node.isBinaryExpression(expression) ? [expression] : []),
          ...expression.getDescendantsOfKind(SyntaxKind.BinaryExpression),
        ].some((binary) =>
          [
            SyntaxKind.AmpersandAmpersandToken,
            SyntaxKind.BarBarToken,
            SyntaxKind.QuestionQuestionToken,
          ].includes(binary.getOperatorToken().getKind()),
        );
        const complex = Boolean(
          Node.isConditionalExpression(expression) ||
          expression.getDescendantsOfKind(SyntaxKind.ConditionalExpression)
            .length ||
          shortCircuit,
        );
        const awaitedCall = Node.isAwaitExpression(expression)
          ? expression.getFirstChildByKind(SyntaxKind.CallExpression)
          : undefined;
        const outerCall = Node.isCallExpression(expression)
          ? expression
          : Node.isCallExpression(awaitedCall)
            ? awaitedCall
            : undefined;
        if (complex) {
          gap(
            expression,
            state,
            "Conditional or short-circuit expression detail is unsupported.",
          );
          if (!outerCall) return;
        }
        if (
          Node.isNewExpression(expression) ||
          expression.getDescendantsOfKind(SyntaxKind.NewExpression).length
        )
          gap(expression, state, "Constructor effects are not traced.");
        const assignments = complex
          ? []
          : [
              ...(Node.isBinaryExpression(expression) ? [expression] : []),
              ...expression.getDescendantsOfKind(SyntaxKind.BinaryExpression),
            ];
        for (const assignment of assignments) {
          if (
            assignment
              .getAncestors()
              .some(
                (ancestor) =>
                  (Node.isArrowFunction(ancestor) ||
                    Node.isFunctionExpression(ancestor)) &&
                  contains(expression, ancestor),
              )
          ) {
            gap(assignment, state, "Assignment inside callback is not traced.");
            continue;
          }
          if (
            assignment.getOperatorToken().getKind() ===
              SyntaxKind.EqualsToken &&
            Node.isPropertyAccessExpression(assignment.getLeft())
          )
            event("assignment", assignment, state, safeText(assignment));
        }
        const calls =
          complex && outerCall
            ? [outerCall]
            : [
                ...(Node.isCallExpression(expression) ? [expression] : []),
                ...expression.getDescendantsOfKind(SyntaxKind.CallExpression),
              ];
        for (const call of calls) {
          if (call.getExpression().getText().includes("?.")) {
            gap(call, state, "Optional call may not execute.");
            continue;
          }
          if (
            call
              .getAncestors()
              .some(
                (ancestor) =>
                  (Node.isArrowFunction(ancestor) ||
                    Node.isFunctionExpression(ancestor)) &&
                  contains(expression, ancestor),
              )
          ) {
            gap(call, state, "Call inside callback is not traced.");
            continue;
          }
          if (
            calls.some((parent) => parent !== call && contains(parent, call))
          ) {
            const resolution = resolveMethod(call, ast);
            const nestedExpression = call.getExpression();
            const directNested =
              Node.isPropertyAccessExpression(nestedExpression) &&
              nestedExpression.getExpression().getText() === "this";
            trace.calls.push({
              caller: result.symbol,
              site: location(ast, call),
              kind: resolution.target
                ? directNested
                  ? "direct"
                  : "declared-target"
                : "unresolved",
              evaluation: "nested-argument",
              path: [...state.path],
              ...(resolution.target
                ? {
                    declaredTarget: symbolName(resolution.target),
                    declaration: location(ast, resolution.target),
                  }
                : {}),
            });
            if (resolution.target && depth < limits.maxDepth)
              analyze(resolution.target, depth + 1);
            gap(
              call,
              state,
              resolution.target
                ? "Nested call target is known; argument evaluation order is not represented as a separate step."
                : "Nested call target and evaluation order are unresolved.",
            );
            continue;
          }
          if (callCount >= limits.maxCallsPerMethod) {
            gap(call, state, "Call count limit reached for this method.");
            break;
          }
          callCount++;
          const expressionNode = call.getExpression();
          const name = safeText(expressionNode);
          const effect = classifyEffect(call, method, state);
          event("call", call, state, name, {
            awaited: directlyAwaited(call),
            ...(effect ? { effect } : {}),
          });
          const resolution = resolveMethod(call, ast);
          const direct =
            Node.isPropertyAccessExpression(expressionNode) &&
            expressionNode.getExpression().getText() === "this";
          const edge: OnboardingTraceCallEdge = {
            caller: result.symbol,
            site: location(ast, call),
            kind: resolution.target
              ? direct
                ? "direct"
                : "declared-target"
              : "unresolved",
            path: [...state.path],
            ...(resolution.target
              ? {
                  declaredTarget: symbolName(resolution.target),
                  declaration: location(ast, resolution.target),
                }
              : {}),
          };
          trace.calls.push(edge);
          if (resolution.target) {
            if (depth < limits.maxDepth) analyze(resolution.target, depth + 1);
            else
              gap(
                call,
                state,
                `Depth limit before ${symbolName(resolution.target)}.`,
              );
          } else
            gap(call, state, resolution.reason ?? "Call target is unresolved.");
        }
      };
      const walkStatements = (
        statements: readonly Statement[],
        initial: PathState[],
      ): PathState[] => {
        let states = initial;
        for (const statement of statements) {
          states = states.flatMap((state) => walkStatement(statement, state));
          if (states.length > limits.maxPaths) {
            gap(
              statement,
              initial[0] ?? { path: [], aliases: new Map() },
              "Path count limit reached.",
            );
            states = states.slice(0, limits.maxPaths);
          }
          if (!states.length) break;
        }
        return states;
      };
      const walkStatement = (
        statement: Statement,
        state: PathState,
      ): PathState[] => {
        if (Node.isBlock(statement))
          return walkStatements(statement.getStatements(), [state]);
        if (Node.isIfStatement(statement)) {
          const condition = safeText(statement.getExpression());
          event("branch", statement, state, condition);
          if (
            statement
              .getExpression()
              .getDescendantsOfKind(SyntaxKind.CallExpression).length
          )
            gap(
              statement.getExpression(),
              state,
              "Calls in branch condition are not traced.",
            );
          const yes = fork(
            state,
            `when ${condition} at ${statement.getStartLineNumber()}`,
          );
          const no = fork(
            state,
            `otherwise ${condition} at ${statement.getStartLineNumber()}`,
          );
          const yesStates = walkStatement(statement.getThenStatement(), yes);
          const noStates = statement.getElseStatement()
            ? walkStatement(statement.getElseStatement()!, no)
            : [no];
          if (
            yesStates.length === 1 &&
            noStates.length === 1 &&
            sameAliases(yesStates[0]!, noStates[0]!)
          )
            return [state];
          return [...yesStates, ...noStates];
        }
        if (
          Node.isReturnStatement(statement) ||
          Node.isThrowStatement(statement)
        ) {
          const expression = statement.getExpression();
          if (expression) inspectExpression(expression, state);
          event(
            Node.isReturnStatement(statement) ? "return" : "throw",
            statement,
            state,
            safeText(statement),
          );
          return [];
        }
        if (Node.isTryStatement(statement)) {
          const normal = walkStatement(
            statement.getTryBlock(),
            fork(state, "try"),
          );
          const caught = statement.getCatchClause()
            ? walkStatement(
                statement.getCatchClause()!.getBlock(),
                fork(state, "catch"),
              )
            : [];
          const survivors = [...normal, ...caught];
          const finallyBlock = statement.getFinallyBlock();
          if (!finallyBlock) return survivors;
          if (!normal.length)
            walkStatement(
              finallyBlock,
              fork(fork(state, "try"), "finally after exit"),
            );
          if (statement.getCatchClause() && !caught.length)
            walkStatement(
              finallyBlock,
              fork(fork(state, "catch"), "finally after exit"),
            );
          if (!survivors.length) {
            return [];
          }
          return dedupeStates(
            survivors.flatMap((path) =>
              walkStatement(finallyBlock, fork(path, "finally")).map(
                (after) => ({
                  path: [...state.path],
                  aliases: after.aliases,
                }),
              ),
            ),
          );
        }
        if (
          Node.isForStatement(statement) ||
          Node.isForOfStatement(statement) ||
          Node.isForInStatement(statement) ||
          Node.isWhileStatement(statement) ||
          Node.isDoStatement(statement) ||
          Node.isSwitchStatement(statement)
        ) {
          gap(
            statement,
            state,
            `Unsupported control flow: ${statement.getKindName()}.`,
          );
          return [state];
        }
        if (Node.isVariableStatement(statement)) {
          for (const declaration of statement.getDeclarations()) {
            const initializer = declaration.getInitializer();
            if (!initializer) continue;
            inspectExpression(initializer, state);
            if (
              statement.getDeclarationKind() ===
                VariableDeclarationKind.Const &&
              isQueryRunnerFactory(initializer, method)
            )
              state.aliases.set(declaration.getName(), "query-runner");
          }
          return [state];
        }
        if (Node.isExpressionStatement(statement)) {
          inspectExpression(statement.getExpression(), state);
          return [state];
        }
        gap(
          statement,
          state,
          `Unsupported statement: ${statement.getKindName()}.`,
        );
        return [state];
      };
      walkStatements(body.getStatements(), [{ path: [], aliases: new Map() }]);
    };
    analyze(handler, 0);
    traces.push(trace);
  }
  return traces;
}

function resolveMethod(
  call: CallExpression,
  ast: TypeScriptAst,
): { target?: MethodDeclaration; reason?: string } {
  const expression = call.getExpression();
  if (Node.isElementAccessExpression(expression))
    return { reason: "Dynamic dispatch is unresolved." };
  if (!Node.isPropertyAccessExpression(expression))
    return { reason: "Indirect or free-function call is unresolved." };
  const declarations = expression.getSymbol()?.getDeclarations() ?? [];
  const methods = declarations.filter(Node.isMethodDeclaration);
  if (declarations.length !== 1 || methods.length !== 1)
    return {
      reason:
        declarations.length > 1
          ? "Ambiguous declared target."
          : "Method target is unavailable.",
    };
  const target = methods[0]!;
  const declaredOwner = target.getParentIfKind(SyntaxKind.ClassDeclaration);
  const receiverOwner = expression
    .getExpression()
    .getType()
    .getSymbol()
    ?.getDeclarations()
    .find(Node.isClassDeclaration);
  if (
    declaredOwner &&
    receiverOwner &&
    (declaredOwner.getSourceFile().getFilePath() !==
      receiverOwner.getSourceFile().getFilePath() ||
      declaredOwner.getStart() !== receiverOwner.getStart())
  )
    return { reason: "Inherited or overridden target is ambiguous." };
  const path = relative(
    ast.repositoryDirectory,
    target.getSourceFile().getFilePath(),
  );
  if (!target.getBody() || !isLocalSource(path))
    return { reason: "Declared method has no supported local body." };
  return { target };
}

function classifyEffect(
  call: CallExpression,
  method: MethodDeclaration,
  state: PathState,
): OnboardingTraceEvent["effect"] | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;
  const receiver = expression.getExpression();
  const name = expression.getName();
  if (Node.isPropertyAccessExpression(receiver)) {
    const root = receiver.getExpression();
    if (
      Node.isIdentifier(root) &&
      state.aliases.get(root.getText()) === "query-runner"
    ) {
      if (receiver.getName() === "manager" && name === "save")
        return "write-like";
    }
    if (receiver.getExpression().getText() === "this") {
      const owner = method.getParentIfKind(SyntaxKind.ClassDeclaration);
      const parameter = owner
        ?.getConstructors()
        .flatMap((ctor) => ctor.getParameters())
        .find((item) => item.getName() === receiver.getName());
      const typeName = parameter?.getTypeNode()?.getText() ?? "";
      if (/Repository$/u.test(typeName)) {
        if (/^(?:get|find)/u.test(name)) return "read-like";
        if (name === "save") return "write-like";
      }
    }
  }
  if (
    Node.isIdentifier(receiver) &&
    state.aliases.get(receiver.getText()) === "query-runner"
  ) {
    if (
      /^(?:commitTransaction|rollbackTransaction|release|startTransaction|connect)$/u.test(
        name,
      )
    )
      return "transaction-like";
  }
  return undefined;
}

function isQueryRunnerFactory(
  initializer: Expression,
  method: MethodDeclaration,
): boolean {
  if (!Node.isCallExpression(initializer)) return false;
  const expression = initializer.getExpression();
  if (
    !Node.isPropertyAccessExpression(expression) ||
    expression.getName() !== "createQueryRunner"
  )
    return false;
  const receiver = expression.getExpression();
  if (
    !Node.isPropertyAccessExpression(receiver) ||
    receiver.getExpression().getText() !== "this"
  )
    return false;
  return Boolean(
    method
      .getParentIfKind(SyntaxKind.ClassDeclaration)
      ?.getConstructors()
      .flatMap((ctor) => ctor.getParameters())
      .some((parameter) => parameter.getName() === receiver.getName()),
  );
}

function directlyAwaited(call: CallExpression): boolean {
  let node: Node = call;
  while (true) {
    const parent = node.getParent();
    if (
      Node.isParenthesizedExpression(parent) ||
      Node.isAsExpression(parent) ||
      Node.isNonNullExpression(parent)
    ) {
      node = parent;
      continue;
    }
    return Node.isAwaitExpression(parent);
  }
}

function fork(state: PathState, condition: string): PathState {
  return { path: [...state.path, condition], aliases: new Map(state.aliases) };
}

function sameAliases(left: PathState, right: PathState): boolean {
  return (
    left.aliases.size === right.aliases.size &&
    [...left.aliases].every(
      ([name, origin]) => right.aliases.get(name) === origin,
    )
  );
}

function dedupeStates(states: PathState[]): PathState[] {
  return states.filter(
    (candidate, index) =>
      states.findIndex(
        (state) =>
          state.path.join("\u0000") === candidate.path.join("\u0000") &&
          sameAliases(state, candidate),
      ) === index,
  );
}

function location(ast: TypeScriptAst, node: Node): OnboardingTraceLocation {
  return {
    file: relative(ast.repositoryDirectory, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    origin: "code",
  };
}

function addGap(
  trace: OnboardingTrace,
  ast: TypeScriptAst,
  node: Node,
  path: readonly string[],
  reason: string,
): void {
  const gap: OnboardingTraceGap = {
    reason,
    at: location(ast, node),
    path: [...path],
  };
  trace.gaps.push(gap);
}

function symbolName(method: MethodDeclaration): string {
  return `${method.getParentIfKind(SyntaxKind.ClassDeclaration)?.getName() ?? "<unknown>"}.${method.getName()}`;
}

function isLocalSource(path: string): boolean {
  return (
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !/(?:^|\/)(?:node_modules|dist|generated)(?:\/|$)/u.test(path) &&
    !path.endsWith(".d.ts")
  );
}

function contains(parent: Node, child: Node): boolean {
  return (
    parent.getStart() <= child.getStart() && parent.getEnd() >= child.getEnd()
  );
}

function compact(value: string): string {
  return value.replace(/\s+/gu, " ").slice(0, 180);
}

function safeText(node: Node): string {
  const literals = new Set<SyntaxKind>([
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateExpression,
    SyntaxKind.NumericLiteral,
    SyntaxKind.BigIntLiteral,
    SyntaxKind.RegularExpressionLiteral,
  ]);
  const start = node.getStart();
  const spans = [node, ...node.getDescendants()]
    .filter((item) => literals.has(item.getKind()))
    .map((item) => ({
      start: item.getStart() - start,
      end: item.getEnd() - start,
    }))
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter(
      (item, index, all) =>
        !all
          .slice(0, index)
          .some((prior) => prior.start <= item.start && prior.end >= item.end),
    );
  let value = node.getText();
  for (const span of spans.reverse())
    value = `${value.slice(0, span.start)}[literal]${value.slice(span.end)}`;
  return compact(value);
}
