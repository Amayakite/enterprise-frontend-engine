import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";

test("查询方案配置与公共动作在实际 TypeScript 调用位置提供悬停说明", () => {
  const file = path.resolve("tests/query-presets-hover-fixture.ts");
  const source = `import type { QueryPresetController, QueryPresetOptions } from "../src/components/business/search/query-presets";
    declare const options: QueryPresetOptions;
    declare const presets: QueryPresetController;
    options.version; presets.apply; presets.setDefault; presets.reload;`;
  const options = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: process.cwd(),
    paths: { "@/*": ["src/*"] },
  };
  const service = ts.createLanguageService({
    ...ts.sys,
    getScriptFileNames: () => [file],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      const text = path.resolve(name) === file ? source : ts.sys.readFile(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
  });
  try {
    for (const [expression, expected] of [
      ["options.version", "语义版本"],
      ["presets.apply", "第一页"],
      ["presets.setDefault", "下次进入"],
      ["presets.reload", "并发冲突"],
    ]) {
      const info = service.getQuickInfoAtPosition(
        file,
        source.indexOf(expression) + expression.indexOf(".") + 1
      );
      assert.ok(ts.displayPartsToString(info?.documentation).includes(expected), expression);
    }
  } finally {
    service.dispose();
  }
});
