import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { checkReferencePage, checkReferenceResolve } from "./reference-harness.mjs";
function api(request) {
  const modules = {
    "@/utils/request": { default: request },
    "@/components/business/MyReference/contract": { checkReferencePage, checkReferenceResolve },
  };
  const js = ts.transpileModule(readFileSync("src/api/reference-lab/index.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", js)((name) => {
    if (!(name in modules)) throw new Error(`Unknown module ${name}`);
    return modules[name];
  }, exports);
  return exports.ProductLabAPI;
}
test("批量 API 每批 100，最多 4 并发，汇总完整且保留请求顺序", async () => {
  let active = 0,
    peak = 0;
  const sizes = [];
  const source = api(async (config) => {
    active++;
    peak = Math.max(active, peak);
    sizes.push(config.data.ids.length);
    assert.equal(config.errorPresentation, "local");
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return { items: config.data.ids.map((id) => ({ id })), unavailableIds: [] };
  });
  const ids = Array.from({ length: 430 }, (_, index) => `id-${index}`);
  const result = await source.resolve(
    ids,
    { organizationId: "org-a" },
    { signal: new AbortController().signal }
  );
  assert.deepEqual(
    result.items.map((row) => row.id),
    ids
  );
  assert.deepEqual(sizes, [100, 100, 100, 100, 30]);
  assert.equal(peak, 4);
});
test("一个批次系统失败整次拒绝，不把剩余 ID 伪装为 unavailable", async () => {
  const source = api(async (config) => {
    if (config.data.ids[0] === "id-100") throw new Error("第二批失败");
    return { items: config.data.ids.map((id) => ({ id })), unavailableIds: [] };
  });
  await assert.rejects(
    source.resolve(
      Array.from({ length: 150 }, (_, index) => `id-${index}`),
      {},
      { signal: new AbortController().signal }
    ),
    /第二批失败/
  );
});
test("开始前已取消不发送批次，空集合不发送请求", async () => {
  let calls = 0;
  const source = api(async () => {
    calls++;
    return { items: [], unavailableIds: [] };
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(source.resolve(["0"], {}, { signal: controller.signal }));
  assert.deepEqual(await source.resolve([], {}, { signal: new AbortController().signal }), {
    items: [],
    unavailableIds: [],
  });
  assert.equal(calls, 0);
});
