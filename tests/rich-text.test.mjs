import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import "./reference-harness.mjs";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const validatorUrl = pathToFileURL(require.resolve("async-validator")).href;
// Node 的直接 CJS 导入不执行 Vite 的 default 互操作；只还原构建器的真实模块行为。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "async-validator")
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(`import mod from "${validatorUrl}"; export default mod.default;`),
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.DOMParser = dom.window.DOMParser;
const { richTextContent, sanitizeRichText } =
  await import("../src/components/business/fields/rich-text.ts");
const { validateFieldModel } = await import("../src/components/business/fields/validation.ts");

test("富文本移除脚本、事件、危险 URL、样式与非白名单元素，保留基础排版", () => {
  const html = sanitizeRichText(
    '<p style="position:fixed" onclick="attack()">你好<strong>客户</strong></p><script>attack()</script><img src=x onerror=attack()><a href="javascript:attack()">链接</a><svg onload=attack()></svg><iframe src="https://example.com"></iframe>'
  );
  assert.match(html, /<strong>客户<\/strong>/);
  assert.doesNotMatch(html, /script|onclick|onerror|onload|javascript:|style=|iframe|svg/i);
  assert.equal(sanitizeRichText(null), "");
});
test("富文本必填依据内容；空标签/空白/无效图片不通过，图片和文本可填写", async () => {
  for (const html of [
    "",
    "<p><br></p>",
    "<p>&nbsp;\u200B</p>",
    "<img src=''>",
    "<script>abc</script>",
  ]) {
    assert.equal(richTextContent(html).hasContent, false, html);
    const result = await validateFieldModel(
      [{ key: "body", label: "说明", type: "rich", form: { required: true } }],
      { model: { body: html }, context: undefined, mode: "add" }
    );
    assert.equal(result.valid, false, html);
  }
  assert.equal(richTextContent('<img src="https://example.com/a.png">').hasContent, true);
  assert.equal(richTextContent("<p>A &amp; B</p><p>第二段</p>").text, "A & B\n第二段");
});
test("富文本 maxlength 校验可见文本，不计算标签；普通字段规则保持有效", async () => {
  const fields = [{ key: "body", label: "说明", type: "rich", props: { maxlength: 2 }, form: {} }];
  for (const [body, valid] of [
    ["<p><strong>你好</strong></p>", true],
    ["<p>你好呀</p>", false],
  ]) {
    const result = await validateFieldModel(fields, {
      model: { body },
      context: undefined,
      mode: "add",
    });
    assert.equal(result.valid, valid);
  }
});
