import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h, reactive, ref } from "vue";
import "./reference-harness.mjs";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/utils/auth")
      return { url: "data:text/javascript,export const hasPerm=()=>true;", shortCircuit: true };
    return next(specifier, context);
  },
});
const { useBatchActions } = await import("../src/composables/useBatchActions.ts");
const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  patchProp() {},
  parentNode: () => null,
  nextSibling: () => null,
});
function mount(overrides = {}) {
  const state = reactive({
    rows: [
      { id: 0, code: "C0" },
      { id: 1, code: "C1" },
    ],
    selectedKeys: [0],
    applied: { quick: [], normal: [], advanced: null },
    total: 121,
    loading: false,
    busyActionKey: null,
    error: null,
  });
  const calls = [],
    lock = ref(false);
  let refreshes = 0,
    batch;
  const app = renderer.createApp({
    setup() {
      batch = useBatchActions({
        module: { meta: { key: "test", componentKey: "customer" }, batch: overrides.identity },
        config: {
          getKey: (row) => row.id,
          scope: () => ({ key: "org-a", value: { organizationId: "org-a" } }),
          toQuery: (value) => value,
        },
        list: {
          state,
          refresh: async () => {
            refreshes++;
          },
        },
        context: () => ({}),
        lock,
        commands: [{ key: "delete", label: "批量删除", allowQuery: true }],
        request: async (request) => {
          calls.push(request);
          if (overrides.fail) throw new Error("离线");
          return {
            requestId: request.requestId,
            matched: 1,
            succeeded: 1,
            failed: 0,
            failures: [],
          };
        },
      });
      return () => h("div");
    },
  });
  app.mount({});
  return { batch, state, calls, lock, refreshes: () => refreshes, close: () => app.unmount() };
}

test("单次请求保留数字 0；默认 batchID，可覆写 batchCode；成功刷新一次", async () => {
  globalThis.ElMessageBox = { confirm: async () => {} };
  const first = mount();
  await Promise.all([first.batch.run("delete"), first.batch.run("delete")]);
  assert.equal(first.calls.length, 1);
  assert.deepEqual(first.calls[0].target, { mode: "selected", field: "batchID", values: [0] });
  assert.equal(first.refreshes(), 1);
  assert.equal(first.lock.value, false);
  first.close();
  const code = mount({ identity: { field: "batchCode", getValue: (row) => row.code } });
  await code.batch.run("delete");
  assert.deepEqual(code.calls[0].target.values, ["C0"]);
  code.close();
});

test("无选择发送全查询而非本页 IDs；确认期间范围改变不会误执行", async () => {
  const item = mount();
  item.state.selectedKeys = [];
  globalThis.ElMessageBox = {
    confirm: async (message) => {
      assert.match(message, /全部 121 条/);
    },
  };
  await item.batch.run("delete");
  assert.equal(item.calls[0].target.mode, "query");
  assert.equal(item.calls[0].target.query.scope.value.organizationId, "org-a");
  globalThis.ElMessageBox = {
    confirm: async () => {
      item.state.selectedKeys = [1];
    },
  };
  await item.batch.run("delete");
  assert.equal(item.calls.length, 1);
  item.close();
});

test("结果未知禁止重复写入，保留请求编号供核实；不自动重试", async () => {
  globalThis.ElMessageBox = { confirm: async () => {} };
  const item = mount({ fail: true });
  await item.batch.run("delete");
  assert.match(item.batch.error, /提交结果待核实/);
  await item.batch.run("delete");
  assert.equal(item.calls.length, 1);
  assert.equal(item.refreshes(), 0);
  item.close();
});
