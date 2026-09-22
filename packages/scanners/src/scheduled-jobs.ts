import type {
  Finding,
  ScheduledJob,
  ScheduledJobType,
} from "@transferkit/core";
import { Node, type Decorator, type SourceFile } from "ts-morph";

import {
  createTypeScriptAst,
  sourceEvidence,
  type TypeScriptAst,
} from "./typescript-ast.js";

export interface ScheduledJobData {
  name: string;
  handler: string;
  type: ScheduledJobType;
  schedule?: string | number;
}

export type ScheduledJobFinding = Finding<ScheduledJobData, "scheduled-job">;

export function discoverScheduledJobs(
  repositoryDirectory: string,
): ScheduledJobFinding[] {
  return discoverScheduledJobsInAst(createTypeScriptAst(repositoryDirectory));
}

export function discoverScheduledJobsInAst(
  ast: TypeScriptAst,
): ScheduledJobFinding[] {
  return ast.sourceFiles.flatMap((file) => jobsInFile(ast, file));
}

export function buildScheduledJobs(
  findings: readonly ScheduledJobFinding[],
): ScheduledJob[] {
  return findings.map(({ id, kind, data, evidence }) => ({
    id,
    kind,
    ...data,
    evidence,
  }));
}

function jobsInFile(
  ast: TypeScriptAst,
  sourceFile: SourceFile,
): ScheduledJobFinding[] {
  const imports = new Map<string, { type: ScheduledJobType; node: Node }>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== "@nestjs/schedule") continue;
    for (const item of declaration.getNamedImports()) {
      const type = decoratorType(item.getName());
      if (type)
        imports.set(item.getAliasNode()?.getText() ?? item.getName(), {
          type,
          node: item,
        });
    }
  }

  const findings: ScheduledJobFinding[] = [];
  for (const owner of sourceFile.getClasses()) {
    for (const method of owner.getMethods()) {
      for (const decorator of method.getDecorators()) {
        const imported = imports.get(decorator.getName());
        if (!imported) continue;
        const schedule = staticSchedule(decorator);
        const declaration = sourceEvidence(
          ast,
          decorator,
          `${decorator.getName()} marks this method as a scheduled job`,
        );
        const className = owner.getName() ?? "anonymous";
        findings.push({
          id: `scheduled-job:${declaration.file}:${className}.${method.getName()}`,
          kind: "scheduled-job",
          data: {
            name: `${className}.${method.getName()}`,
            handler: method.getName(),
            type: imported.type,
            ...(schedule === undefined ? {} : { schedule }),
          },
          evidence: [
            declaration,
            sourceEvidence(
              ast,
              imported.node,
              `${decorator.getName()} is imported from @nestjs/schedule`,
            ),
          ],
        });
      }
    }
  }
  return findings;
}

function decoratorType(name: string): ScheduledJobType | undefined {
  if (name === "Cron") return "cron";
  if (name === "Interval") return "interval";
  if (name === "Timeout") return "timeout";
  return undefined;
}

function staticSchedule(decorator: Decorator): string | number | undefined {
  const argument = decorator.getCallExpression()?.getArguments()[0];
  if (
    Node.isStringLiteral(argument) ||
    Node.isNoSubstitutionTemplateLiteral(argument)
  )
    return argument.getLiteralValue();
  if (Node.isNumericLiteral(argument))
    return Number(argument.getLiteralValue());
  return undefined;
}
