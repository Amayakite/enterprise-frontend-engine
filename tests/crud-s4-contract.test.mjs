import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

test("S4 公共兼容增强的类型正反例逐项生效", () => {
  const configPath = path.resolve("tests/type-cases/tsconfig.crud-s4.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n")
  );
  const fixture = path.resolve("tests/type-cases/crud-s4.ts");
  const source = fs.readFileSync(fixture, "utf8");
  const negative = source
    .split(/\r?\n/)
    .flatMap((line, index) => (line.includes("@ts-expect-error") ? [index + 1] : []));
  const host = ts.createCompilerHost(parsed.options);
  const read = host.readFile.bind(host);
  host.readFile = (file) =>
    path.resolve(file) === fixture
      ? source.replaceAll("@ts-expect-error", "negative-example")
      : read(file);
  const rejected = ts.getPreEmitDiagnostics(
    ts.createProgram(parsed.fileNames, parsed.options, host)
  );
  const lines = new Set(
    rejected
      .filter((item) => item.file && path.resolve(item.file.fileName) === fixture)
      .map((item) => item.file.getLineAndCharacterOfPosition(item.start).line)
  );
  negative.forEach((line) => assert.ok(lines.has(line), `第 ${line + 1} 行未拒绝`));
  assert.equal(rejected.length, negative.length);
});
