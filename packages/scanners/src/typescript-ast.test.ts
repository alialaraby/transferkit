import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Node } from "ts-morph";
import { describe, expect, it } from "vitest";

import { createTypeScriptAst, sourceEvidence } from "./typescript-ast.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/ast-analysis",
);

describe("TypeScript AST", () => {
  it("provides source, class, method, decorator, argument, and evidence access", () => {
    const ast = createTypeScriptAst(join(fixtures, "unusable-tsconfig"));
    const sourceFile = ast.sourceFiles[0];
    const classDeclaration = sourceFile?.getClasses()[0];
    const method = classDeclaration?.getMethods()[0];
    const decorator = method?.getDecorators()[0];
    const argument = decorator?.getCallExpression()?.getArguments()[0];

    expect(sourceFile?.getBaseName()).toBe("example.ts");
    expect(classDeclaration?.getName()).toBe("ExampleService");
    expect(method?.getName()).toBe("handle");
    expect(decorator?.getName()).toBe("Example");
    expect(Node.isObjectLiteralExpression(argument)).toBe(true);
    expect(method).toBeDefined();
    expect(
      sourceEvidence(ast, method!.getNameNode(), "Example method"),
    ).toEqual({
      file: "src/example.ts",
      line: 5,
      description: "Example method",
    });
  });
});
