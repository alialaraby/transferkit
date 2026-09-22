import type { Finding } from "@transferkit/core";
import {
  Node,
  SyntaxKind,
  type CallExpression,
  type Expression,
  type SourceFile,
} from "ts-morph";

import {
  createTypeScriptAst,
  sourceEvidence,
  type TypeScriptAst,
} from "./typescript-ast.js";

export type SourceDiscoveryFinding = Finding<
  Record<string, string | undefined>,
  | "database"
  | "database.configuration"
  | "database.entity"
  | "integration"
  | "environment.variable"
  | "configuration"
>;

export function discoverSourceFeatures(
  repositoryDirectory: string,
): SourceDiscoveryFinding[] {
  return discoverSourceFeaturesInAst(createTypeScriptAst(repositoryDirectory));
}

export function discoverSourceFeaturesInAst(
  ast: TypeScriptAst,
): SourceDiscoveryFinding[] {
  return ast.sourceFiles.flatMap((file) => discoverInFile(ast, file));
}

function discoverInFile(
  ast: TypeScriptAst,
  file: SourceFile,
): SourceDiscoveryFinding[] {
  const findings: SourceDiscoveryFinding[] = [];
  const imports = new Map<string, string>();
  for (const declaration of file.getImportDeclarations()) {
    const module = declaration.getModuleSpecifierValue();
    for (const item of declaration.getNamedImports())
      imports.set(
        item.getAliasNode()?.getText() ?? item.getName(),
        `${module}:${item.getName()}`,
      );
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport)
      imports.set(defaultImport.getText(), `${module}:default`);
  }

  for (const classDeclaration of file.getClasses()) {
    const entity = classDeclaration
      .getDecorators()
      .find((d) => imports.get(d.getName()) === "typeorm:Entity");
    if (entity)
      add(
        findings,
        ast,
        entity,
        "database.entity",
        `database.entity:${relativeId(ast, entity)}:${classDeclaration.getName() ?? "anonymous"}`,
        { name: classDeclaration.getName() ?? "anonymous", orm: "TypeORM" },
        "TypeORM Entity decorator declares a database entity",
      );
  }

  for (const access of file.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    const expression = access.getExpression();
    if (
      Node.isPropertyAccessExpression(expression) &&
      expression.getExpression().getText() === "process" &&
      expression.getName() === "env"
    ) {
      const name = access.getName();
      add(
        findings,
        ast,
        access,
        "environment.variable",
        `environment.variable:${name}:${relativeId(ast, access)}`,
        { name },
        `Environment variable ${name} is referenced`,
      );
    }
  }

  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();
    const text = expression.getText();
    if (
      (text.endsWith("TypeOrmModule.forRoot") ||
        text.endsWith("TypeOrmModule.forRootAsync")) &&
      importsHas(imports, "@nestjs/typeorm", "TypeOrmModule")
    ) {
      const config = typeormConfig(call);
      add(
        findings,
        ast,
        call,
        "database.configuration",
        `database.configuration:${relativeId(ast, call)}`,
        { orm: "TypeORM", ...config },
        "NestJS TypeORM configuration is declared here",
      );
      if (config.databaseType === "postgres")
        add(
          findings,
          ast,
          call,
          "database",
          `database.postgresql:${relativeId(ast, call)}`,
          { name: "PostgreSQL" },
          "TypeORM is statically configured with the postgres driver",
        );
    }
    if (isConfigGet(expression, imports)) {
      const key = staticString(call.getArguments()[0]);
      if (key)
        add(
          findings,
          ast,
          call,
          "configuration",
          `configuration:${key}:${relativeId(ast, call)}`,
          { key, framework: "NestJS Config" },
          `NestJS configuration key ${key} is referenced`,
        );
    }
    const integration = integrationData(call, imports);
    if (integration)
      add(
        findings,
        ast,
        call,
        "integration",
        `integration:${relativeId(ast, call)}`,
        integration,
        `Outbound ${integration.client} client call`,
      );
  }
  return findings;
}

function typeormConfig(call: CallExpression): Record<string, string> {
  const argument = call.getArguments()[0];
  if (!Node.isObjectLiteralExpression(argument)) return {};
  const type = argument.getProperty("type");
  if (!Node.isPropertyAssignment(type)) return {};
  const value = staticString(type.getInitializer());
  return value ? { databaseType: value } : {};
}

function isConfigGet(
  expression: Expression,
  imports: Map<string, string>,
): boolean {
  if (
    !Node.isPropertyAccessExpression(expression) ||
    expression.getName() !== "get"
  )
    return false;
  const receiver = expression.getExpression().getText();
  return [...imports.entries()].some(
    ([local, origin]) =>
      origin === "@nestjs/config:ConfigService" &&
      receiver
        .toLowerCase()
        .includes(local.replace("Service", "").toLowerCase()),
  );
}

function integrationData(
  call: CallExpression,
  imports: Map<string, string>,
): Record<string, string> | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression) && expression.getText() === "fetch")
    return { client: "fetch", ...endpoint(call) };
  if (Node.isPropertyAccessExpression(expression)) {
    const receiver = expression.getExpression().getText();
    if (
      [...imports.values()].includes("axios:default") &&
      receiver ===
        [...imports.entries()].find(([, v]) => v === "axios:default")?.[0]
    )
      return { client: "axios", ...endpoint(call) };
    if (
      importsHas(imports, "@nestjs/axios", "HttpService") &&
      (receiver.toLowerCase().includes("httpservice") ||
        receiver === "this.httpService")
    )
      return { client: "NestJS HttpService", ...endpoint(call) };
  }
  return undefined;
}

function endpoint(call: CallExpression): Record<string, string> {
  const value = staticString(call.getArguments()[0]);
  return value ? { endpoint: value } : {};
}

function staticString(node: Node | undefined): string | undefined {
  return Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralValue()
    : undefined;
}

function importsHas(
  imports: Map<string, string>,
  module: string,
  name: string,
): boolean {
  return [...imports.values()].includes(`${module}:${name}`);
}
function relativeId(ast: TypeScriptAst, node: Node): string {
  const e = sourceEvidence(ast, node);
  return `${e.file}:${e.line}`;
}
function add(
  findings: SourceDiscoveryFinding[],
  ast: TypeScriptAst,
  node: Node,
  kind: SourceDiscoveryFinding["kind"],
  id: string,
  data: Record<string, string>,
  description: string,
): void {
  findings.push({
    id,
    kind,
    data,
    evidence: [sourceEvidence(ast, node, description)],
  });
}
