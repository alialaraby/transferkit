import { relative } from "node:path";

import type { Evidence } from "@transferkit/core";
import { Project, type Node, type SourceFile } from "ts-morph";

export interface TypeScriptAst {
  repositoryDirectory: string;
  project: Project;
  sourceFiles: readonly SourceFile[];
}

export function createTypeScriptAst(
  repositoryDirectory: string,
): TypeScriptAst {
  // Scanner discovery only needs syntax, so source loading deliberately does not
  // depend on a repository tsconfig being present or valid.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { experimentalDecorators: true },
  });
  project.addSourceFilesAtPaths([
    `${repositoryDirectory}/**/*.ts`,
    `!${repositoryDirectory}/**/*.d.ts`,
    `!${repositoryDirectory}/**/{dist,node_modules}/**/*`,
  ]);

  return {
    repositoryDirectory,
    project,
    sourceFiles: project.getSourceFiles(),
  };
}

export function sourceEvidence(
  ast: TypeScriptAst,
  node: Node,
  description?: string,
): Evidence {
  return {
    file: relative(ast.repositoryDirectory, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    ...(description === undefined ? {} : { description }),
  };
}
