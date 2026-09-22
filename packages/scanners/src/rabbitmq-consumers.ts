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

export type MessagingConsumerFinding = Finding<
  MessagingConsumerData,
  "messaging.consumer"
>;

export function discoverRabbitMqConsumers(
  repositoryDirectory: string,
): MessagingConsumerFinding[] {
  return discoverRabbitMqConsumersInAst(
    createTypeScriptAst(repositoryDirectory),
  );
}

export function discoverRabbitMqConsumersInAst(
  ast: TypeScriptAst,
): MessagingConsumerFinding[] {
  return ast.sourceFiles.flatMap((sourceFile) =>
    consumersInFile(ast, sourceFile),
  );
}

function consumersInFile(
  ast: TypeScriptAst,
  sourceFile: SourceFile,
): MessagingConsumerFinding[] {
  const decoratorImports = new Map<string, Node>();

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (
      declaration.getModuleSpecifierValue() !== "@golevelup/nestjs-rabbitmq"
    ) {
      continue;
    }

    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() === "RabbitSubscribe") {
        decoratorImports.set(
          namedImport.getAliasNode()?.getText() ?? namedImport.getName(),
          namedImport,
        );
      }
    }
  }

  if (decoratorImports.size === 0) {
    return [];
  }

  const findings: MessagingConsumerFinding[] = [];

  for (const classDeclaration of sourceFile.getClasses()) {
    for (const method of classDeclaration.getMethods()) {
      const decorator = method
        .getDecorators()
        .find((candidate) => decoratorImports.has(candidate.getName()));
      if (decorator === undefined) {
        continue;
      }

      const metadata = readMetadata(decorator);
      if (metadata === undefined) {
        continue;
      }

      const declarationEvidence = sourceEvidence(
        ast,
        decorator,
        "RabbitSubscribe decorator marks this method as a RabbitMQ consumer",
      );
      const importEvidence = sourceEvidence(
        ast,
        decoratorImports.get(decorator.getName())!,
        "RabbitSubscribe is imported from @golevelup/nestjs-rabbitmq",
      );
      const className = classDeclaration.getName() ?? "anonymous";
      findings.push({
        id: `messaging.consumer:${declarationEvidence.file}:${className}.${method.getName()}`,
        kind: "messaging.consumer",
        data: { name: method.getName(), ...metadata },
        evidence: [declarationEvidence, importEvidence],
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
