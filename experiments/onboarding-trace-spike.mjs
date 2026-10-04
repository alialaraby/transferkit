// Isolated experiment. This is not imported by the production guide pipeline.
import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

export function traceRoute(root, controllerFile, handlerName, maxDepth = 2) {
  const configPath = ts.findConfigFile(
    root,
    ts.sys.fileExists,
    "tsconfig.json",
  );
  if (!configPath) throw new Error(`No tsconfig.json in ${root}`);
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"),
    );
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
  const controllerPath = resolve(root, controllerFile);
  if (!existsSync(controllerPath))
    throw new Error(`Missing controller: ${controllerPath}`);
  // Load the route's import graph, not every file listed by the repository config.
  const program = ts.createProgram([controllerPath], {
    ...config.options,
    noEmit: true,
    incremental: false,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(controllerPath);
  if (!source) throw new Error(`Controller not loaded: ${controllerPath}`);
  const owner = findClassWithMethod(source, handlerName);
  if (!owner) throw new Error(`Handler ${handlerName} not found`);
  const handler = owner.members.find(
    (member) =>
      ts.isMethodDeclaration(member) &&
      member.name?.getText(source) === handlerName,
  );
  const methods = [];
  const gaps = [];
  const seen = new Set();
  let limitReached = false;

  function evidence(node) {
    const file = node.getSourceFile();
    const path = relative(root, file.fileName);
    return `${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
  }
  function insideRoot(node) {
    const path = relative(root, node.getSourceFile().fileName);
    return (
      path !== "" &&
      !path.startsWith(`..${sep}`) &&
      path !== ".." &&
      !path.startsWith("node_modules")
    );
  }
  function symbolName(method) {
    const parent = method.parent;
    return `${ts.isClassDeclaration(parent) ? (parent.name?.text ?? "<anonymous>") : "<non-class>"}.${method.name?.getText() ?? "<unknown>"}`;
  }
  function resolveCall(call) {
    const expression = call.expression;
    if (ts.isElementAccessExpression(expression))
      return { gap: "dynamic dispatch" };
    if (!ts.isPropertyAccessExpression(expression))
      return { gap: "indirect or unsupported call" };
    const receiver = expression.expression;
    const isThisCall = receiver.kind === ts.SyntaxKind.ThisKeyword;
    const isInjectedCall =
      ts.isPropertyAccessExpression(receiver) &&
      receiver.expression.kind === ts.SyntaxKind.ThisKeyword;
    if (!isThisCall && !isInjectedCall)
      return { gap: "receiver alias or external call" };
    const declarations =
      checker.getSymbolAtLocation(expression.name)?.declarations ?? [];
    const targets = declarations.filter(
      (declaration) =>
        ts.isMethodDeclaration(declaration) &&
        declaration.body &&
        insideRoot(declaration),
    );
    if (targets.length === 1 && declarations.length === 1)
      return { target: targets[0] };
    if (declarations.length > 1 || declarations.some(ts.isMethodSignature))
      return { gap: "ambiguous provider implementation" };
    return { gap: "method body unavailable or unresolved type" };
  }
  function inspect(method, depth) {
    if (!method?.body) return;
    const id = `${evidence(method)}:${symbolName(method)}`;
    if (seen.has(id)) return;
    seen.add(id);
    if (methods.length >= 50) {
      limitReached = true;
      return;
    }
    const item = {
      symbol: symbolName(method),
      declaration: evidence(method),
      events: [],
    };
    methods.push(item);
    const follow = [];
    function event(kind, node, detail, conditions = [], awaited) {
      item.events.push({
        kind,
        at: evidence(node),
        detail,
        ...(conditions.length ? { conditions } : {}),
        ...(awaited === undefined ? {} : { awaited }),
      });
    }
    function visit(node, conditions = []) {
      if (ts.isIfStatement(node)) {
        const condition = node.expression
          .getText()
          .replace(/\s+/g, " ")
          .slice(0, 180);
        visit(node.expression, conditions);
        event("branch", node, condition, conditions);
        visit(node.thenStatement, [...conditions, `when ${condition}`]);
        if (node.elseStatement)
          visit(node.elseStatement, [...conditions, `else ${condition}`]);
        return;
      }
      if (
        ts.isSwitchStatement(node) ||
        ts.isConditionalExpression(node) ||
        ts.isForStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node)
      ) {
        gaps.push({
          at: evidence(node),
          from: item.symbol,
          reason: `unsupported control flow: ${ts.SyntaxKind[node.kind]}`,
        });
        return;
      }
      if (ts.isTryStatement(node)) {
        visit(node.tryBlock, [...conditions, "try"]);
        if (node.catchClause) {
          event(
            "catch",
            node.catchClause,
            "catch branch; outcome unverified",
            conditions,
          );
          visit(node.catchClause.block, [...conditions, "catch"]);
        }
        if (node.finallyBlock)
          visit(node.finallyBlock, [...conditions, "finally"]);
        return;
      }
      if (ts.isThrowStatement(node)) {
        event(
          "throw",
          node,
          node.expression?.getText().replace(/\s+/g, " ").slice(0, 120) ??
            "throw",
          conditions,
        );
        return;
      }
      if (
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        ts.isFunctionDeclaration(node)
      ) {
        gaps.push({
          at: evidence(node),
          from: item.symbol,
          reason: "nested function or callback body not followed",
        });
        return;
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left)
      ) {
        event(
          "assignment",
          node,
          `${node.left.getText()} = ${node.right.getText().replace(/\s+/g, " ").slice(0, 100)}`,
          conditions,
        );
      }
      if (ts.isCallExpression(node)) {
        const result = resolveCall(node);
        const detail = node.expression.getText().replace(/\s+/g, " ");
        const nestedArgument =
          node.parent && ts.isCallExpression(node.parent)
            ? ["nested call argument"]
            : [];
        const callConditions = [...conditions, ...nestedArgument];
        const awaited = ts.isAwaitExpression(node.parent);
        if (result.target) {
          const target = result.target;
          const symbol = symbolName(target);
          const kind = /Repository\.(?:get|find)/u.test(symbol)
            ? "read-like call"
            : /Repository\.save$/u.test(symbol)
              ? "write-like call"
              : "call";
          event(
            kind,
            node,
            `${detail} -> declared ${symbol} @ ${evidence(target)}`,
            callConditions,
            awaited,
          );
          if (depth < maxDepth) follow.push(target);
          else
            gaps.push({
              at: evidence(node),
              from: item.symbol,
              reason: `depth limit before ${symbolName(target)}`,
            });
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword ||
            node.expression.expression.getText().startsWith("this.") ||
            /^queryRunner(?:\.|$)/u.test(node.expression.expression.getText()))
        ) {
          const writeLike = /(?:^|\.)save$/u.test(detail);
          event(
            writeLike ? "write-like call (unresolved)" : "unresolved call",
            node,
            `${detail}: ${result.gap}`,
            callConditions,
            awaited,
          );
          gaps.push({
            at: evidence(node),
            from: item.symbol,
            reason: `${detail}: ${result.gap}`,
          });
        } else if (ts.isElementAccessExpression(node.expression)) {
          event(
            "unresolved call",
            node,
            `${detail}: dynamic dispatch`,
            callConditions,
            awaited,
          );
          gaps.push({
            at: evidence(node),
            from: item.symbol,
            reason: `${detail}: dynamic dispatch`,
          });
        } else if (ts.isIdentifier(node.expression)) {
          const symbol = checker.getSymbolAtLocation(node.expression);
          const resolved =
            symbol && symbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(symbol)
              : symbol;
          if (resolved?.declarations?.some(insideRoot)) {
            event(
              "unresolved call",
              node,
              `${detail}: project free function call unsupported`,
              callConditions,
              awaited,
            );
            gaps.push({
              at: evidence(node),
              from: item.symbol,
              reason: `${detail}: project free function call unsupported`,
            });
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, conditions));
    }
    visit(method.body);
    item.events.sort(
      (a, b) => Number(a.at.split(":").at(-1)) - Number(b.at.split(":").at(-1)),
    );
    for (const target of follow) inspect(target, depth + 1);
  }
  inspect(handler, 0);
  if (limitReached)
    gaps.push({
      at: evidence(handler),
      from: symbolName(handler),
      reason: "50-method limit reached",
    });
  return {
    tool: `TypeScript ${ts.version} compiler API`,
    config: relative(root, configPath),
    sourceFiles: program.getSourceFiles().filter(insideRoot).length,
    methods,
    gaps,
    diagnostics: ts
      .getPreEmitDiagnostics(program)
      .slice(0, 5)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      ),
  };
}

function findClassWithMethod(source, name) {
  return source.statements.find(
    (statement) =>
      ts.isClassDeclaration(statement) &&
      statement.members.some(
        (member) =>
          ts.isMethodDeclaration(member) &&
          member.name?.getText(source) === name,
      ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  const [root, controller, method, depth] = process.argv.slice(2);
  if (!root || !controller || !method) {
    process.stderr.write(
      "Usage: node experiments/onboarding-trace-spike.mjs ROOT CONTROLLER METHOD [DEPTH]\n",
    );
    process.exitCode = 2;
  } else {
    process.stdout.write(
      `${JSON.stringify(traceRoute(resolve(root), controller, method, depth ? Number(depth) : 2), null, 2)}\n`,
    );
  }
}
