import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";

const project = "tests/type-cases/tsconfig.navigation-contract.json";
const fixture = path.resolve("tests/type-cases/navigation-contract.ts");

test("withMap 与页面 form.references 保留 Row、ID、上下文及字段值推导", () => {
  try {
    execFileSync(
      process.execPath,
      ["node_modules/vue-tsc/bin/vue-tsc.js", "--noEmit", "--pretty", "false", "-p", project],
      { encoding: "utf8" }
    );
  } catch (error) {
    assert.fail(error.stdout || error.message);
  }
});

test("withMap 与 form.references 的实际悬停说明可读", () => {
  const source = ts.sys.readFile(fixture);
  assert.ok(source);
  const json = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(json.config, ts.sys, process.cwd());
  const service = ts.createLanguageService({
    ...ts.sys,
    getScriptFileNames: () => [fixture],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      const text = ts.sys.readFile(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
  });
  try {
    for (const [expression, offset] of [
      ["customerReferences.province.withMap", "customerReferences.province.".length],
      ["references: { provinceId: localProvince }", "references".length - 1],
    ]) {
      const position = source.indexOf(expression);
      assert.ok(position >= 0, expression);
      const info = service.getQuickInfoAtPosition(fixture, position + offset + 1);
      assert.ok(ts.displayPartsToString(info?.documentation).length > 10, expression);
    }
  } finally {
    service.dispose();
  }
});
