import { relative } from "node:path";

import type {
  OnboardingQueueEvidence,
  OnboardingTraceLocation,
} from "@transferkit/core";
import { Node, SyntaxKind } from "ts-morph";

import type { TypeScriptAst } from "./typescript-ast.js";

/** Evidence for the @nestjs/bullmq Queue.add and WorkerHost.process pattern only. */
export function discoverOnboardingQueuesInAst(
  ast: TypeScriptAst,
): OnboardingQueueEvidence {
  const publications: OnboardingQueueEvidence["publications"] = [];
  const handlers: OnboardingQueueEvidence["handlers"] = [];
  const at = (node: Node): OnboardingTraceLocation => ({
    file: relative(ast.repositoryDirectory, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    origin: "code",
  });
  const constants = new Map<string, Node[]>();
  for (const file of ast.sourceFiles)
    for (const owner of file.getClasses())
      for (const property of owner
        .getProperties()
        .filter((item) => item.isStatic())) {
        const initializer = property.getInitializer();
        if (owner.getName() !== "Constants" || !initializer) continue;
        const hasLiteral =
          Node.isStringLiteral(initializer) ||
          (Node.isBinaryExpression(initializer) &&
            initializer.getOperatorToken().getKind() ===
              SyntaxKind.BarBarToken &&
            Node.isStringLiteral(initializer.getRight()));
        if (hasLiteral) {
          const name = `Constants.${property.getName()}`;
          constants.set(name, [...(constants.get(name) ?? []), property]);
        }
      }
  const queue = (expression: Node | undefined): string | undefined => {
    if (Node.isStringLiteral(expression)) return expression.getLiteralValue();
    if (Node.isPropertyAccessExpression(expression)) {
      const known = constants.get(expression.getText());
      const declarations = expression
        .getNameNode()
        .getSymbol()
        ?.getDeclarations();
      if (
        known?.length === 1 &&
        declarations?.some(
          (declaration) =>
            declaration.getSourceFile().getFilePath() ===
              known[0]!.getSourceFile().getFilePath() &&
            declaration.getStartLineNumber() === known[0]!.getStartLineNumber(),
        )
      )
        return expression.getText();
    }
    return undefined;
  };
  for (const file of ast.sourceFiles) {
    const imports = new Map<string, string>();
    for (const declaration of file.getImportDeclarations())
      for (const item of declaration.getNamedImports())
        imports.set(
          item.getAliasNode()?.getText() ?? item.getName(),
          `${declaration.getModuleSpecifierValue()}:${item.getName()}`,
        );
    const bullmq = (name: string): string | undefined =>
      [...imports].find(([, value]) => value === `@nestjs/bullmq:${name}`)?.[0];
    const queueType = [...imports].find(
      ([, value]) => value === "bullmq:Queue",
    )?.[0];
    const processor = bullmq("Processor");
    const injectQueue = bullmq("InjectQueue");
    const workerHost = bullmq("WorkerHost");
    for (const owner of file.getClasses()) {
      const ownerName = owner.getName();
      if (!ownerName) continue;
      const registration = processor
        ? owner
            .getDecorators()
            .find((decorator) => decorator.getName() === processor)
        : undefined;
      const registeredQueue = queue(
        registration?.getCallExpression()?.getArguments()[0],
      );
      const process = owner.getMethod("process");
      if (
        registration &&
        registeredQueue &&
        process?.getBody() &&
        owner.getExtends()?.getText() === workerHost
      )
        handlers.push({
          queue: registeredQueue,
          symbol: `${ownerName}.process`,
          registration: at(registration),
          declaration: at(process),
        });
      if (!injectQueue || !queueType) continue;
      const injections = new Map<
        string,
        { name: string; at: OnboardingTraceLocation }
      >();
      for (const constructor of owner.getConstructors())
        for (const parameter of constructor.getParameters()) {
          if (!parameter.isParameterProperty()) continue;
          if (parameter.getTypeNode()?.getText() !== queueType) continue;
          const decorator = parameter
            .getDecorators()
            .find((item) => item.getName() === injectQueue);
          const name = queue(decorator?.getCallExpression()?.getArguments()[0]);
          if (decorator && name)
            injections.set(parameter.getName(), { name, at: at(decorator) });
        }
      if (!injections.size) continue;
      for (const method of owner.getMethods())
        for (const call of method.getDescendantsOfKind(
          SyntaxKind.CallExpression,
        )) {
          const access = call.getExpression();
          if (
            !Node.isPropertyAccessExpression(access) ||
            access.getName() !== "add"
          )
            continue;
          const receiver = access.getExpression();
          if (!Node.isPropertyAccessExpression(receiver)) continue;
          if (receiver.getExpression().getText() !== "this") continue;
          const injected = injections.get(receiver.getName());
          const job = call.getArguments()[0];
          if (!injected || !Node.isStringLiteral(job)) continue;
          publications.push({
            caller: `${ownerName}.${method.getName()}`,
            queue: injected.name,
            job: job.getLiteralValue(),
            at: at(call),
            injection: injected.at,
          });
        }
    }
  }
  return { publications, handlers };
}
