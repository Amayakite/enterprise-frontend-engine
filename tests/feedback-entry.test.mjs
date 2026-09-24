import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse } from "vue/compiler-sfc";

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(file);
    return /\.(vue|[cm]?[jt]sx?)$/.test(file) ? [file] : [];
  });
}

test("所有手写源码禁止绕过统一 feedback 使用 Element Plus 轻提示", () => {
  const violations = [];
  for (const file of sourceFiles("src")) {
    const text = readFileSync(file, "utf8");
    const descriptor = file.endsWith(".vue") ? parse(text).descriptor : undefined;
    const scripts = descriptor
      ? [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean)
      : [text];
    if (
      descriptor?.template &&
      /\bElMessage\b|\bElNotification\b|\$message\b|\$notify\b/.test(descriptor.template.content)
    )
      violations.push(`${file}: template 使用旧提示入口`);
    for (const script of scripts) {
      const source = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (
          (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
          ["ElMessage", "ElNotification", "$message", "$notify"].includes(node.text)
        )
          violations.push(`${file}: ${node.text}`);
        if (
          ts.isStringLiteral(node) &&
          /element-plus\/(?:es|lib)\/components\/(?:message|notification)(?:\/|$)/.test(node.text)
        )
          violations.push(`${file}: ${node.text}`);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  assert.deepEqual(violations, [], "轻提示必须使用 @/utils/feedback；ElMessageBox 确认流程仍允许");
  assert.doesNotMatch(
    readFileSync("vite.config.ts", "utf8"),
    /["'](?:ElMessage|ElNotification)["']/
  );
});
