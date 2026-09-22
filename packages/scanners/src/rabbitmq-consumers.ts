import type { Finding } from "@transferkit/core";
import {
  Node,
  type Decorator,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";

import {
  createTypeScriptAst,
  sourceEvidence,
  type TypeScriptAst,
} from "./typescript-ast.js";

export interface MessagingConsumerData {
  name: string;
  queue?: string;
  exchange?: string;
  routingKey?: string;
}

export function discoverRabbitMqConsumers(
  repositoryDirectory: string,
): Finding<MessagingConsumerData>[] {
  return discoverRabbitMqConsumersInAst(
    createTypeScriptAst(repositoryDirectory),
  );
}

export function discoverRabbitMqConsumersInAst(
  ast: TypeScriptAst,
): Finding<MessagingConsumerData>[] {
  return ast.sourceFiles.flatMap((sourceFile) =>
    consumersInFile(ast, sourceFile),
  );
}

function consumersInFile(
  ast: TypeScriptAst,
  sourceFile: SourceFile,
): Finding<MessagingConsumerData>[] {
  const decoratorNames = new Set<string>();

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (
      declaration.getModuleSpecifierValue() !== "@golevelup/nestjs-rabbitmq"
    ) {
      continue;
    }

    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() === "RabbitSubscribe") {
        decoratorNames.add(
          namedImport.getAliasNode()?.getText() ?? namedImport.getName(),
        );
      }
    }
  }

  if (decoratorNames.size === 0) {
    return [];
  }

  const findings: Finding<MessagingConsumerData>[] = [];

  for (const classDeclaration of sourceFile.getClasses()) {
    for (const method of classDeclaration.getMethods()) {
      const decorator = method
        .getDecorators()
        .find((candidate) => decoratorNames.has(candidate.getName()));
      if (decorator === undefined) {
        continue;
      }

      const metadata = readMetadata(decorator);
      if (metadata === undefined) {
        continue;
      }

      const line = method.getNameNode().getStartLineNumber();
      const evidence = sourceEvidence(
        ast,
        method.getNameNode(),
        "RabbitMQ consumer declaration",
      );
      findings.push({
        id: `messaging.consumer:${evidence.file}:${line}`,
        kind: "messaging.consumer",
        data: { name: method.getName(), ...metadata },
        evidence: [evidence],
      });
    }
  }

  return findings;
}

function readMetadata(
  decorator: Decorator,
): Omit<MessagingConsumerData, "name"> | undefined {
  const argument = decorator.getCallExpression()?.getArguments()[0];
  if (!Node.isObjectLiteralExpression(argument)) {
    return undefined;
  }

  return {
    ...stringProperty(argument, "queue"),
    ...stringProperty(argument, "exchange"),
    ...stringProperty(argument, "routingKey"),
  };
}

function stringProperty(
  object: ObjectLiteralExpression,
  name: "queue" | "exchange" | "routingKey",
): Partial<Record<typeof name, string>> {
  const property = object.getProperty(name);
  if (!Node.isPropertyAssignment(property)) {
    return {};
  }

  const initializer = property.getInitializer();
  if (
    Node.isStringLiteral(initializer) ||
    Node.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    return { [name]: initializer.getLiteralValue() };
  }

  return {};
}
