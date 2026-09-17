import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";

test("公共上传配置、FileAPI 和请求入口在实际调用处提供 TS 悬停说明", () => {
  const files = ["src/components/common/Upload/useUpload.ts", "src/api/file/index.ts"].map((file) =>
    path.resolve(file)
  );
  const json = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(json.config, ts.sys, process.cwd());
  const service = ts.createLanguageService({
    ...ts.sys,
    getScriptFileNames: () => files,
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
    for (const [file, needle, offset] of [
      [files[0], "config.name", "config.".length],
      [files[0], "FileAPI.upload", "FileAPI.".length],
      [files[1], "request<unknown", 0],
    ]) {
      const source = ts.sys.readFile(file);
      const position = source.indexOf(needle);
      assert.ok(position >= 0, needle);
      const info = service.getQuickInfoAtPosition(file, position + offset + 1);
      assert.ok(ts.displayPartsToString(info?.documentation).length > 10, needle);
      assert.ok(
        info?.tags?.some((tag) => tag.name === "example"),
        needle
      );
    }
  } finally {
    service.dispose();
  }
});
