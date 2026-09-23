import test from "node:test";
import assert from "node:assert/strict";
import { effectScope } from "vue";
import { pending } from "./reference-harness.mjs";
const { usePageTable } = await import("../src/composables/usePageTable.ts");

function setup() {
  const scope = effectScope();
  const calls = [];
  const table = scope.run(() =>
    usePageTable({
      initialParams: { pageNum: 1, pageSize: 20, keyword: "" },
      request(params, signal) {
        const task = pending();
        calls.push({ ...task, params, signal });
        return task.promise;
      },
    })
  );
  return { scope, calls, table };
}

test("旧查询即使无法取消也不回填，旧 finally 不会提前结束新查询的 loading", async () => {
  const { scope, calls, table } = setup();
  try {
    const first = table.fetchData();
    table.params.pageNum = 2;
    const second = table.fetchData();
    assert.equal(calls[0].params.pageNum, 1);
    assert.equal(calls[0].signal.aborted, true);
    calls[0].resolve({ list: ["old"], total: 1 });
    await first;
    assert.deepEqual(table.list.value, []);
    assert.equal(table.loading.value, true);
    calls[1].resolve({ list: ["new"], total: 2 });
    await second;
    assert.deepEqual(table.list.value, ["new"]);
    assert.equal(table.total.value, 2);
    assert.equal(table.loading.value, false);
  } finally {
    scope.stop();
  }
});

test("迟到失败被忽略，当前失败仍向调用方抛出并结束 loading", async () => {
  const { scope, calls, table } = setup();
  try {
    const first = table.fetchData();
    const second = table.handleQuery();
    calls[0].reject(new Error("old"));
    await first;
    assert.equal(table.loading.value, true);
    calls[1].reject(new Error("current"));
    await assert.rejects(second, /current/);
    assert.equal(table.loading.value, false);
  } finally {
    scope.stop();
  }
});

test("销毁作用域后取消在途请求且不再回填", async () => {
  const { scope, calls, table } = setup();
  const task = table.fetchData();
  scope.stop();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve({ list: ["late"], total: 1 });
  await task;
  assert.deepEqual(table.list.value, []);
  assert.equal(table.loading.value, false);
});
