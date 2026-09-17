import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import path from "node:path";

test("实际 customer 配置的查询开关可读取 TS 悬停文档与 example", () => {
  const file = path.resolve("src/pages/base/customer/config.ts");
  const text = ts.sys.readFile(file);
  const json = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(json.config, ts.sys, process.cwd());
  const service = ts.createLanguageService({
    ...ts.sys,
    getScriptFileNames: () => [file],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      const content = ts.sys.readFile(name);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
  });
  try {
    for (const property of ["normal", "advanced", "keyword"]) {
      const position = text.indexOf(`${property}: true`);
      assert.ok(position > 0);
      const info = service.getQuickInfoAtPosition(file, position + 1);
      assert.ok(ts.displayPartsToString(info?.documentation).length > 10, property);
      assert.ok(
        info?.tags?.some((tag) => tag.name === "example"),
        property
      );
    }
  } finally {
    service.dispose();
  }
});
