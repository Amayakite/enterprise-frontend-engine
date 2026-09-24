import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFileUrl } from "../src/api/file/url.ts";
import { toPreviewFiles } from "../src/components/common/FilePreview/file-kind.ts";

test("文件地址只向当前应用或配置的 API 域携带认证", () => {
  const origin = "https://app.example.com";
  const api = "https://api.example.com/v1";
  assert.equal(resolveFileUrl("/api/files/1", origin, api).authenticated, true);
  assert.equal(resolveFileUrl("https://api.example.com/file/1", origin, api).authenticated, true);
  assert.equal(
    resolveFileUrl("https://cdn.example.com/file?signature=abc", origin, api).authenticated,
    false
  );
  for (const value of [
    "javascript:alert(1)",
    "//evil.example/a",
    "/\\evil.example/a",
    "https://user:pass@example.com/a",
    " https://example.com/a",
    "data:text/html,abc",
  ]) {
    assert.throws(() => resolveFileUrl(value, origin, api), undefined, value);
  }
});

test("畸形附件 DTO 不进入预览文件组，也不修改输入", () => {
  const valid = { name: "合同.docx", url: "/files/42" };
  const input = [null, 12, {}, { name: "错误", url: 2 }, valid];
  assert.deepEqual(toPreviewFiles(input), [valid]);
  assert.equal(input.length, 5);
  assert.deepEqual(toPreviewFiles(null), []);
});
