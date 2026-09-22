import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";

test("统一页面、state、生命周期与 Vue 字段插槽保留正反向类型约束", () => {
  try {
    execFileSync(
      process.execPath,
      [
        "node_modules/vue-tsc/bin/vue-tsc.js",
        "--noEmit",
        "-p",
        "tests/type-cases/tsconfig.crud-page.json",
      ],
      { encoding: "utf8" }
    );
  } catch (error) {
    assert.fail(error.stdout || error.message);
  }
});
test("实际调用处的生命周期与富文本字段提供 TypeScript 悬停说明", () => {
  const file = path.resolve("tests/type-cases/crud-page.ts");
  const source = ts.sys.readFile(file);
  const json = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(json.config, ts.sys, process.cwd());
  const service = ts.createLanguageService({
    ...ts.sys,
    getScriptFileNames: () => [file],
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
    for (const needle of [
      "beforeOpen: async",
      "validate: async",
      "beforeSave: async",
      "change: async",
      "header: ({ state })",
      'height: "320px"',
      'readonlyDisplay: "html"',
    ]) {
      const position = source.indexOf(needle);
      assert.ok(position >= 0, needle);
      const info = service.getQuickInfoAtPosition(file, position + 1);
      assert.ok(ts.displayPartsToString(info?.documentation).length > 10, needle);
    }
    for (const [expression, offset] of [
      ["state.custom.reviewed = true", "state.".length],
      ["state.hydrationRevision", "state.".length],
      ["state.canSave", "state.".length],
      ["bindings.fields", "bindings.".length],
      ['actions.patch({ customerName: "正确" })', "actions.".length],
      ['bindings.child("contacts")', "bindings.".length],
      [
        'bindings.fields.controller.focusIssue({ field: "customerName"',
        "bindings.fields.controller.".length,
      ],
    ]) {
      const position = source.indexOf(expression);
      const info = service.getQuickInfoAtPosition(file, position + offset + 1);
      assert.ok(ts.displayPartsToString(info?.documentation).length > 10, expression);
    }
  } finally {
    service.dispose();
  }
});
