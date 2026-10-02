import { relative } from "node:path";

import type {
  OnboardingConceptEvidence,
  OnboardingTraceLocation,
} from "@transferkit/core";
import { Node } from "ts-morph";

import type { TypeScriptAst } from "./typescript-ast.js";

const relationNames = new Set([
  "OneToMany",
  "ManyToOne",
  "OneToOne",
  "ManyToMany",
]);
const columnNames = new Set([
  "Column",
  "PrimaryColumn",
  "PrimaryGeneratedColumn",
  "CreateDateColumn",
  "UpdateDateColumn",
  "DeleteDateColumn",
  "VersionColumn",
]);

export function discoverOnboardingConceptsInAst(
  ast: TypeScriptAst,
): OnboardingConceptEvidence {
  const entities: OnboardingConceptEvidence["entities"] = [];
  const repositories: OnboardingConceptEvidence["repositories"] = [];
  const methodResults: OnboardingConceptEvidence["methodResults"] = [];
  const injections: OnboardingConceptEvidence["injections"] = [];
  const at = (node: Node): OnboardingTraceLocation => ({
    file: relative(ast.repositoryDirectory, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
    origin: "code",
  });
  for (const file of ast.sourceFiles) {
    const imported = new Map<string, string>();
    for (const declaration of file.getImportDeclarations())
      for (const item of declaration.getNamedImports())
        imported.set(
          item.getAliasNode()?.getText() ?? item.getName(),
          `${declaration.getModuleSpecifierValue()}:${item.getName()}`,
        );
    const typeorm = (name: string): string | undefined =>
      [...imported].find(([, value]) => value === `typeorm:${name}`)?.[0];
    const injectRepository = [...imported].find(
      ([, value]) => value === "@nestjs/typeorm:InjectRepository",
    )?.[0];
    for (const owner of file.getClasses()) {
      const name = owner.getName();
      if (!name) continue;
      if (
        owner
          .getDecorators()
          .some((decorator) => decorator.getName() === typeorm("Entity")) &&
        typeorm("Entity")
      ) {
        const fields: OnboardingConceptEvidence["entities"][number]["fields"] =
          [];
        const relations: OnboardingConceptEvidence["entities"][number]["relations"] =
          [];
        for (const property of owner.getProperties())
          for (const decorator of property.getDecorators()) {
            const relation = [...relationNames].find(
              (item) => decorator.getName() === typeorm(item),
            );
            if (relation) {
              const target = decorator
                .getCallExpression()
                ?.getArguments()[0]
                ?.getText()
                .match(/=>\s*([A-Za-z_$][\w$]*)/u)?.[1];
              if (target)
                relations.push({
                  property: property.getName(),
                  target,
                  kind: relation,
                  at: at(decorator),
                });
            } else if (
              [...columnNames].some(
                (item) => decorator.getName() === typeorm(item),
              )
            )
              fields.push({ name: property.getName(), at: at(decorator) });
          }
        entities.push({ name, declaration: at(owner), fields, relations });
      }
      for (const constructor of owner.getConstructors())
        for (const parameter of constructor.getParameters()) {
          const repository = parameter.getTypeNode()?.getText();
          if (!repository || !parameter.isParameterProperty()) continue;
          injections.push({
            owner: name,
            property: parameter.getName(),
            repository,
            at: at(parameter),
          });
        }
      const inherited = owner.getExtends()?.getText();
      const inheritedEntity = inherited?.match(
        /<\s*([A-Za-z_$][\w$]*)\s*>/u,
      )?.[1];
      const inheritedBase = inherited?.split("<")[0];
      const hasRepositoryBase =
        inheritedBase === typeorm("Repository") ||
        owner.getConstructors().some((constructor) =>
          constructor.getParameters().some((parameter) => {
            const type = parameter.getTypeNode()?.getText();
            return (
              type ===
                `${typeorm("Repository") ?? "Repository"}<${inheritedEntity}>` &&
              parameter
                .getDecorators()
                .some((decorator) => decorator.getName() === injectRepository)
            );
          }),
        );
      if (hasRepositoryBase && inheritedEntity)
        repositories.push({
          repository: name,
          entity: inheritedEntity,
          at: at(owner.getExtends() ?? owner),
        });
      if (hasRepositoryBase)
        for (const method of owner.getMethods()) {
          const declared = method.getReturnTypeNode()?.getText();
          const inner =
            declared?.startsWith("Promise<") && declared.endsWith(">")
              ? declared.slice(8, -1)
              : declared;
          const candidates = inner
            ?.replace(/\[\]$/u, "")
            .split("|")
            .map((part) => part.trim())
            .filter((part) => part !== "undefined" && part !== "null");
          const result =
            candidates?.length === 1 &&
            /^[A-Za-z_$][\w$]*$/u.test(candidates[0]!)
              ? candidates[0]
              : undefined;
          if (result)
            methodResults.push({
              repository: name,
              method: method.getName(),
              entity: result,
              at: at(method),
            });
        }
    }
  }
  const entityNames = new Set(entities.map((entity) => entity.name));
  return {
    entities: entities.map((entity) => ({
      ...entity,
      relations: entity.relations.filter((relation) =>
        entityNames.has(relation.target),
      ),
    })),
    repositories: repositories.filter((binding) =>
      entityNames.has(binding.entity),
    ),
    methodResults: methodResults.filter((result) =>
      entityNames.has(result.entity),
    ),
    injections,
  };
}
