import type { Finding } from "@transferkit/core";
import {
  Node,
  SyntaxKind,
  type ClassDeclaration,
  type Decorator,
  type SourceFile,
} from "ts-morph";

import {
  createTypeScriptAst,
  sourceEvidence,
  type TypeScriptAst,
} from "./typescript-ast.js";

export type HandoverContextKind =
  | "application.entry-point"
  | "application.module"
  | "application.controller"
  | "application.route"
  | "application.service"
  | "application.dependency"
  | "security.guard"
  | "database.relationship"
  | "observability.signal";

export type HandoverContextFinding = Finding<
  Record<string, string>,
  HandoverContextKind
>;

export function discoverHandoverContext(
  repositoryDirectory: string,
): HandoverContextFinding[] {
  return discoverHandoverContextInAst(createTypeScriptAst(repositoryDirectory));
}

export function discoverHandoverContextInAst(
  ast: TypeScriptAst,
): HandoverContextFinding[] {
  return ast.sourceFiles.flatMap((file) => discoverFile(ast, file));
}

function discoverFile(
  ast: TypeScriptAst,
  file: SourceFile,
): HandoverContextFinding[] {
  const findings: HandoverContextFinding[] = [];
  const imports = new Map<string, string>();
  for (const declaration of file.getImportDeclarations()) {
    const module = declaration.getModuleSpecifierValue();
    for (const item of declaration.getNamedImports()) {
      imports.set(
        item.getAliasNode()?.getText() ?? item.getName(),
        `${module}:${item.getName()}`,
      );
    }
  }
  const nest = (name: string, origin = "@nestjs/common") =>
    [...imports.entries()].find(
      ([, value]) => value === `${origin}:${name}`,
    )?.[0];
  const decorator = (
    owner: ClassDeclaration,
    name: string,
  ): Decorator | undefined => {
    const local = nest(name);
    return local
      ? owner.getDecorators().find((candidate) => candidate.getName() === local)
      : undefined;
  };

  for (const owner of file.getClasses()) {
    const name = owner.getName() ?? "anonymous";
    const module = decorator(owner, "Module");
    if (module) {
      const metadata = module.getCallExpression()?.getArguments()[0];
      add(
        findings,
        ast,
        module,
        "application.module",
        `module:${name}:${location(ast, module)}`,
        {
          name,
          ...(Node.isObjectLiteralExpression(metadata)
            ? {
                imports: arrayProperty(metadata, "imports"),
                importNames: arrayPropertyNames(metadata, "imports"),
                controllers: arrayProperty(metadata, "controllers"),
                providers: arrayProperty(metadata, "providers"),
              }
            : {}),
        },
        `NestJS module ${name} groups application components`,
      );
    }
    const controller = decorator(owner, "Controller");
    if (controller) {
      const controllerPaths = routePaths(
        controller.getCallExpression()?.getArguments()[0],
      );
      add(
        findings,
        ast,
        controller,
        "application.controller",
        `controller:${name}:${location(ast, controller)}`,
        {
          name,
          ...(controllerPaths?.length === 1
            ? { path: controllerPaths[0] }
            : {}),
        },
        `NestJS controller ${name} handles routes`,
      );
      const routes: readonly [string, string][] = [
        ["Get", "GET"],
        ["Post", "POST"],
        ["Put", "PUT"],
        ["Patch", "PATCH"],
        ["Delete", "DELETE"],
        ["All", "ALL"],
      ];
      for (const method of owner.getMethods()) {
        for (const [routeDecorator, verb] of routes) {
          const local = nest(routeDecorator);
          const route = local
            ? method.getDecorators().find((item) => item.getName() === local)
            : undefined;
          if (!route) continue;
          const methodPaths = routePaths(
            route.getCallExpression()?.getArguments()[0],
          );
          const paths =
            controllerPaths &&
            methodPaths &&
            controllerPaths.length * methodPaths.length <= 20
              ? [
                  ...new Set(
                    controllerPaths.flatMap((prefix) =>
                      methodPaths.map(
                        (segment) =>
                          `/${[prefix, segment]
                            .filter(Boolean)
                            .map((part) => part.replace(/^\/+|\/+$/gu, ""))
                            .filter(Boolean)
                            .join("/")}`,
                      ),
                    ),
                  ),
                ]
              : [undefined];
          paths.forEach((path, index) =>
            add(
              findings,
              ast,
              route,
              "application.route",
              `route:${name}.${method.getName()}:${location(ast, route)}${paths.length > 1 ? `:${index + 1}` : ""}`,
              {
                controller: name,
                method: method.getName(),
                verb,
                ...(path === undefined ? {} : { path }),
              },
              `${verb} route on ${name}.${method.getName()}`,
              [
                sourceEvidence(ast, controller),
                ...routeDefinitionEvidence(
                  ast,
                  controller.getCallExpression()?.getArguments()[0],
                ),
                ...routeDefinitionEvidence(
                  ast,
                  route.getCallExpression()?.getArguments()[0],
                ),
              ],
            ),
          );
        }
      }
    }
    const injectable = decorator(owner, "Injectable");
    if (injectable) {
      const dependencies = owner
        .getConstructors()
        .flatMap((ctor) =>
          ctor
            .getParameters()
            .map((param) => param.getTypeNode()?.getText() ?? param.getName()),
        );
      add(
        findings,
        ast,
        injectable,
        "application.service",
        `service:${name}:${location(ast, injectable)}`,
        { name, dependencies: dependencies.join(", ") },
        `NestJS provider ${name} can participate in application flows`,
      );
    }
    if (controller || injectable) {
      for (const parameter of owner
        .getConstructors()
        .flatMap((ctor) => ctor.getParameters())) {
        const type = parameter.getTypeNode()?.getText() ?? "";
        const direct = /^[A-Za-z_$][\w$]*$/u.test(type) ? type : undefined;
        const repository = /^Repository<([A-Za-z_$][\w$]*)>$/u.exec(type);
        const injectRepository = parameter
          .getDecorators()
          .some(
            (item) =>
              imports.get(item.getName()) ===
                "@nestjs/typeorm:InjectRepository" &&
              item.getCallExpression()?.getArguments()[0]?.getText() ===
                repository?.[1],
          );
        const target =
          repository &&
          imports.get("Repository") === "typeorm:Repository" &&
          injectRepository
            ? repository[1]
            : direct;
        const origin = target ? imports.get(target) : undefined;
        if (
          !target ||
          (repository && !injectRepository) ||
          (!repository &&
            !origin?.startsWith(".") &&
            !file
              .getClasses()
              .some((candidate) => candidate.getName() === target))
        )
          continue;
        add(
          findings,
          ast,
          parameter,
          "application.dependency",
          `dependency:${name}:${target}:${location(ast, parameter)}`,
          {
            source: name,
            target,
            dependencyKind: repository ? "repository-entity" : "constructor",
          },
          `${name} declares a constructor dependency on ${target}`,
        );
      }
    }
    for (const target of [owner, ...owner.getMethods()]) {
      const local = nest("UseGuards");
      const guard = local
        ? target.getDecorators().find((item) => item.getName() === local)
        : undefined;
      if (guard) {
        const guards =
          guard
            .getCallExpression()
            ?.getArguments()
            .map((arg) => arg.getText())
            .join(", ") ?? "";
        add(
          findings,
          ast,
          guard,
          "security.guard",
          `guard:${name}:${location(ast, guard)}`,
          {
            owner: target === owner ? name : `${name}.${target.getName()}`,
            guards,
          },
          `NestJS guard protects ${name}`,
        );
      }
    }
    const entityLocal = nest("Entity", "typeorm");
    if (
      entityLocal &&
      owner.getDecorators().some((item) => item.getName() === entityLocal)
    ) {
      for (const property of owner.getProperties()) {
        for (const relationType of [
          "OneToMany",
          "ManyToOne",
          "OneToOne",
          "ManyToMany",
        ]) {
          const local = nest(relationType, "typeorm");
          const relation = local
            ? property.getDecorators().find((item) => item.getName() === local)
            : undefined;
          if (!relation) continue;
          const target = relation
            .getCallExpression()
            ?.getArguments()[0]
            ?.getText()
            .match(/(?:=>\s*)([A-Za-z_$][\w$]*)/u)?.[1];
          if (!target) continue;
          add(
            findings,
            ast,
            relation,
            "database.relationship",
            `relation:${name}.${property.getName()}:${location(ast, relation)}`,
            {
              source: name,
              property: property.getName(),
              target,
              relation: relationType,
            },
            `${name}.${property.getName()} relates to ${target}`,
          );
        }
      }
    }
  }

  const nestFactory = nest("NestFactory", "@nestjs/core");
  const logger = nest("Logger");
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();
    if (
      nestFactory &&
      Node.isPropertyAccessExpression(expression) &&
      expression.getExpression().getText() === nestFactory &&
      expression.getName() === "create"
    ) {
      const module = call.getArguments()[0]?.getText() ?? "unknown";
      add(
        findings,
        ast,
        call,
        "application.entry-point",
        `entry:${location(ast, call)}`,
        { module },
        `Application bootstraps ${module}`,
      );
    }
    if (
      logger &&
      Node.isPropertyAccessExpression(expression) &&
      ["error", "warn", "log", "debug"].includes(expression.getName()) &&
      /logger/iu.test(expression.getExpression().getText())
    ) {
      add(
        findings,
        ast,
        call,
        "observability.signal",
        `log:${location(ast, call)}`,
        { method: expression.getName(), owner: file.getBaseName() },
        `${expression.getName()} log signal`,
      );
    }
  }
  return findings;
}

function arrayProperty(
  object: Node & { getProperty(name: string): Node | undefined },
  name: string,
): string {
  const property = object.getProperty(name);
  if (!Node.isPropertyAssignment(property)) return "";
  const initializer = property.getInitializer();
  return Node.isArrayLiteralExpression(initializer)
    ? initializer
        .getElements()
        .map((item) => item.getText())
        .join(", ")
    : "";
}

function arrayPropertyNames(
  object: Node & { getProperty(name: string): Node | undefined },
  name: string,
): string {
  const property = object.getProperty(name);
  if (!Node.isPropertyAssignment(property)) return "";
  const initializer = property.getInitializer();
  if (!Node.isArrayLiteralExpression(initializer)) return "";
  return initializer
    .getElements()
    .flatMap((element) => {
      if (Node.isIdentifier(element)) return [element.getText()];
      if (Node.isCallExpression(element)) {
        const expression = element.getExpression();
        if (
          Node.isPropertyAccessExpression(expression) &&
          Node.isIdentifier(expression.getExpression())
        )
          return [expression.getExpression().getText()];
      }
      return [];
    })
    .join(", ");
}

function literal(node: Node | undefined): string | undefined {
  return Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
    ? node.getLiteralValue()
    : undefined;
}

function routeSegment(
  node: Node | undefined,
  seen = new Set<Node>(),
): string | undefined {
  if (!node) return "";
  if (seen.has(node)) return undefined;
  seen.add(node);
  const value = literal(node);
  if (value !== undefined) return value;
  if (Node.isArrayLiteralExpression(node)) {
    const elements = node.getElements();
    return elements.length === 1 ? routeSegment(elements[0], seen) : undefined;
  }
  if (Node.isTemplateExpression(node)) {
    let result = node.getHead().getLiteralText();
    for (const span of node.getTemplateSpans()) {
      const part = routeSegment(span.getExpression(), seen);
      if (part === undefined) return undefined;
      result += part + span.getLiteral().getLiteralText();
    }
    return result;
  }
  if (Node.isParenthesizedExpression(node))
    return routeSegment(node.getExpression(), seen);
  if (Node.isPropertyAccessExpression(node) || Node.isIdentifier(node)) {
    const declarations = node.getSymbol()?.getDeclarations() ?? [];
    if (declarations.length !== 1) return undefined;
    const declaration = declarations[0];
    if (Node.isPropertyDeclaration(declaration) && !declaration.isStatic())
      return undefined;
    if (
      Node.isPropertyDeclaration(declaration) ||
      Node.isVariableDeclaration(declaration)
    )
      return routeSegment(declaration.getInitializer(), seen);
  }
  return undefined;
}

function routePaths(
  node: Node | undefined,
  seen = new Set<Node>(),
): string[] | undefined {
  if (!node) return [""];
  if (seen.has(node)) return undefined;
  seen.add(node);
  if (Node.isArrayLiteralExpression(node)) {
    const paths = node
      .getElements()
      .map((item) => routePaths(item, new Set(seen)));
    return paths.length > 0 && paths.every((item) => item !== undefined)
      ? [...new Set(paths.flatMap((item) => item ?? []))]
      : undefined;
  }
  if (Node.isParenthesizedExpression(node))
    return routePaths(node.getExpression(), seen);
  if (Node.isPropertyAccessExpression(node) || Node.isIdentifier(node)) {
    const declarations = node.getSymbol()?.getDeclarations() ?? [];
    if (declarations.length !== 1) return undefined;
    const declaration = declarations[0];
    if (Node.isPropertyDeclaration(declaration) && !declaration.isStatic())
      return undefined;
    if (
      Node.isPropertyDeclaration(declaration) ||
      Node.isVariableDeclaration(declaration)
    )
      return routePaths(declaration.getInitializer(), seen);
  }
  const segment = routeSegment(node);
  return segment === undefined ? undefined : [segment];
}

function routeDefinitionEvidence(
  ast: TypeScriptAst,
  node: Node | undefined,
  seen = new Set<Node>(),
): ReturnType<typeof sourceEvidence>[] {
  if (!node || seen.has(node)) return [];
  seen.add(node);
  if (Node.isPropertyAccessExpression(node) || Node.isIdentifier(node)) {
    const declarations = node.getSymbol()?.getDeclarations() ?? [];
    if (declarations.length !== 1) return [];
    const declaration = declarations[0];
    if (Node.isPropertyDeclaration(declaration) && !declaration.isStatic())
      return [];
    if (
      Node.isPropertyDeclaration(declaration) ||
      Node.isVariableDeclaration(declaration)
    )
      return [
        sourceEvidence(ast, declaration),
        ...routeDefinitionEvidence(ast, declaration.getInitializer(), seen),
      ];
  }
  return node
    .getChildren()
    .flatMap((child) => routeDefinitionEvidence(ast, child, seen));
}

function location(ast: TypeScriptAst, node: Node): string {
  const evidence = sourceEvidence(ast, node);
  return `${evidence.file}:${evidence.line}`;
}

function add(
  findings: HandoverContextFinding[],
  ast: TypeScriptAst,
  node: Node,
  kind: HandoverContextKind,
  id: string,
  data: Record<string, string>,
  description: string,
  extraEvidence: ReturnType<typeof sourceEvidence>[] = [],
): void {
  findings.push({
    id,
    kind,
    data,
    evidence: [sourceEvidence(ast, node, description), ...extraEvidence],
  });
}
