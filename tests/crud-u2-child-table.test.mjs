import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const read = (file) => fs.readFileSync(file, "utf8");

test("U2 子表高度、分页阈值和复杂编辑收敛到公共组件", () => {
  const child = read("src/components/business/crud/MyCrudChildTable.vue");
  assert.match(child, /height: "auto"/);
  assert.match(child, /rows\.value\.length > props\.pageSize/);
  assert.match(child, /presentation: editPresentation/);
  assert.match(child, /dialog: editDialog/);
  assert.match(child, /drawer: editDrawer/);

  for (const file of [
    "src/pages/base/customer/children/contacts/CustomerContacts.vue",
    "src/pages/base/customer/children/addresses/CustomerAddresses.vue",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /tableHeight/);
    assert.doesNotMatch(source, /rows\.value\.length \*/);
  }
  assert.match(
    read("src/pages/base/customer/children/contacts/config.ts"),
    /editPresentation: "inline"/
  );
  assert.match(
    read("src/pages/base/customer/children/addresses/config.ts"),
    /editPresentation: "drawer"/
  );
});

test("U2 TableView 重算动态行高并标记错误行", () => {
  const view = read("src/components/table/TableView.vue");
  assert.match(view, /engine\.value\?\.recalculate\(true\)/);
  assert.match(view, /await engine\.value\?\.scrollToRow/);
  assert.match(view, /table-view__error/);
  assert.match(view, /scroll-x="\{ enabled: true, gt: 0 \}"/);
  assert.match(view, /<template #loading>/);
  assert.match(view, /i-svg:refresh/);
  assert.match(view, /正在更新表格数据/);
  assert.doesNotMatch(view, /v-else-if="resolvedHeight !== undefined"/);
});

test("U2 MyTable 统一弹窗、错误摘要与聚焦顺序", () => {
  const table = read("src/components/table/MyTable.vue");
  assert.match(table, /import MyDialog from/);
  assert.match(table, /import MyDrawer from/);
  assert.match(table, /:is="editorShell"/);
  assert.match(table, /<MyForm/);
  assert.match(table, /发现 \{\{ draft\.errors\.value\.length \}\} 项错误/);
  assert.match(table, /@click="focusCell\(error\.rowKey, error\.field\)"/);
  assert.match(table, /await table\.value\?\.recalculate\(\)/);
  assert.match(table, /await table\.value\?\.scrollToCell/);
  assert.match(table, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
  assert.match(table, /focusFieldControl\(cell\)/);
});

test("U2 编辑呈现公开类型正反例逐项生效", () => {
  const configPath = path.resolve("tests/type-cases/tsconfig.crud-u2.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n")
  );

  const fixture = path.resolve("tests/type-cases/crud-u2.ts");
  const source = read(fixture);
  const negative = source
    .split(/\r?\n/)
    .flatMap((line, index) => (line.includes("@ts-expect-error") ? [index + 1] : []));
  const host = ts.createCompilerHost(parsed.options);
  const originalRead = host.readFile.bind(host);
  host.readFile = (file) =>
    path.resolve(file) === fixture
      ? source.replaceAll("@ts-expect-error", "negative-example")
      : originalRead(file);
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
