import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";

function createService(file) {
  const json = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(json.config, ts.sys, process.cwd());
  return ts.createLanguageService({
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
}

function quickInfoDocumentation(file, needle, offset = 0) {
  const source = ts.sys.readFile(file);
  assert.ok(source, file);
  const position = source.indexOf(needle);
  assert.ok(position >= 0, needle);
  const service = createService(file);
  try {
    const info = service.getQuickInfoAtPosition(file, position + offset + 1);
    return ts.displayPartsToString(info?.documentation);
  } finally {
    service.dispose();
  }
}

test("实际 Customer 保存反馈配置的 saved 悬停说明包含默认文案和 false 关闭语义", () => {
  const file = path.resolve("src/pages/base/customer/config.ts");
  const documentation = quickInfoDocumentation(file, 'saved: "客户资料已保存"');
  assert.match(documentation, /保存并回填成功/);
  assert.match(documentation, /false/);
  assert.match(documentation, /关闭轻提示/);
});

test("实际 Sale drawer 配置的 component 悬停说明明确非标签页 loader 合同", () => {
  const file = path.resolve("src/pages/base/sale/config.ts");
  const documentation = quickInfoDocumentation(file, 'component: () => import("./add.vue")');
  assert.match(documentation, /非标签模式必填/);
  assert.match(documentation, /add\.vue\/edit\.vue/);
});

test("FeedbackProps 与 FeedbackEmits 的实际对象调用可读取展示和关闭职责", () => {
  const file = path.resolve("tests/type-cases/feedback-public-contract.ts");
  const inlineVariant = quickInfoDocumentation(file, 'variant: "inline"');
  assert.match(inlineVariant, /inline 默认嵌入页面/);
  assert.match(inlineVariant, /floating.*FeedbackHost/);

  const closable = quickInfoDocumentation(file, "closable: false");
  assert.match(closable, /默认 false/);
  assert.match(closable, /只发事件/);
  assert.match(closable, /不修改业务状态/);

  const close = quickInfoDocumentation(file, "close: []");
  assert.match(close, /宿主负责移除本次展示/);
  assert.match(close, /不清除表单或错误事实/);
});
