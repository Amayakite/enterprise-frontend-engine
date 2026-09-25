import { test, after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { validateDocx } from "../src/components/common/WordEditor/validate-docx.ts";

const dom = new JSDOM();
const originalParser = globalThis.DOMParser;
globalThis.DOMParser = dom.window.DOMParser;
after(() => {
  globalThis.DOMParser = originalParser;
  dom.window.close();
});

async function wordPackage(xml) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
  );
  if (xml !== undefined) zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "arraybuffer" });
}

test("DOCX 校验拒绝普通文本和缺少主文档的 ZIP，避免引擎静默打开空白", async () => {
  await assert.rejects(
    validateDocx(new TextEncoder().encode("invalid docx").buffer),
    /不是可读取的 DOCX/
  );
  await assert.rejects(validateDocx(await wordPackage()), /不是可读取的 DOCX/);
});

test("DOCX 校验拒绝畸形 XML 及伪装成 Word 的其他 XML", async () => {
  for (const xml of ["<broken", "<document/>", "<html><body>text</body></html>"]) {
    await assert.rejects(validateDocx(await wordPackage(xml)), /不是可读取的 DOCX/);
  }
});

test("DOCX 校验接受两种 Word 命名空间且不改动输入字节", async () => {
  for (const ns of [
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",
  ]) {
    const bytes = await wordPackage(
      `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>[[甲方名称]]</w:t></w:r></w:p></w:body></w:document>`
    );
    const before = bytes.slice(0);
    await validateDocx(bytes);
    assert.deepEqual(bytes, before);
  }
});
