import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith(".ts") ? [file] : [];
  });
}

test("business TS 公开声明与嵌套字段均有 JSDoc，example 标签独立成行", () => {
  const missing = [];
  for (const file of files("src/components/business")) {
    const text = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function visit(node) {
      const member = ts.isPropertySignature(node) || ts.isMethodSignature(node);
      const exported =
        (ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isFunctionDeclaration(node)) &&
        node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword);
      if ((member || exported) && !node.jsDoc?.some((doc) => doc.comment)) {
        missing.push(
          `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.name?.getText(source)}`
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.doesNotMatch(text, /\* @example[^\S\r\n]+[^\r\n\s]/, `${file}: @example 必须独立成行`);
  }
  assert.deepEqual(missing, [], "新增字段必须在声明处写有意义的 JSDoc；本测试不替代语义审查");
});
