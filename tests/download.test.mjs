import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness({ failClick = false } = {}) {
  const links = [],
    created = [],
    revoked = [],
    messages = [];
  const window = {
    URL: {
      createObjectURL(blob) {
        created.push(blob);
        return "blob:download";
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
  };
  const document = {
    createElement() {
      const link = {
        click() {
          if (failClick) throw new Error("click failed");
        },
        remove() {
          this.removed = true;
        },
      };
      links.push(link);
      return link;
    },
    body: { appendChild() {} },
  };
  const source = ts.transpileModule(readFileSync("src/utils/download.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "window", "document", source)(exports, window, document);
  return { ...exports, links, created, revoked, messages };
}

test("下载复用原始 Blob，正确读取扩展文件名且移除链接与对象 URL", () => {
  const ctx = harness();
  const blob = new Blob(["content"], { type: "application/pdf" });
  ctx.downloadFile({
    data: blob,
    headers: {
      "content-disposition": "attachment; filename*=UTF-8''%E5%AE%A2%E6%88%B7.pdf; size=7",
    },
  });
  assert.equal(ctx.links[0].download, "客户.pdf");
  assert.equal(ctx.created[0], blob);
  assert.equal(ctx.links[0].removed, true);
  assert.deepEqual(ctx.revoked, ["blob:download"]);
});

test("非法百分号文件名可回退，点击失败仍释放资源并保留异常", () => {
  const ctx = harness({ failClick: true });
  assert.throws(
    () =>
      ctx.downloadFile({
        data: new ArrayBuffer(1),
        headers: { "content-disposition": "attachment; filename*=UTF-8''%ZZ; filename=report.pdf" },
      }),
    /click failed/
  );
  assert.equal(ctx.links[0].download, "report.pdf");
  assert.equal(ctx.links[0].removed, true);
  assert.equal(ctx.revoked.length, 1);
  assert.equal(ctx.messages.length, 0);
});
