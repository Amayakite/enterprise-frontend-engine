import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, ref } from "vue";
import { flush, pending } from "./reference-harness.mjs";
const { useQueryPresets } = await import("../src/composables/useQueryPresets.ts");
const { parseQueryPreset } = await import("../src/components/business/search/query-presets.ts");
const { useSearchQuery } = await import("../src/composables/useSearchQuery.ts");
const { userDataStore } = await import("../src/utils/user-data/index.ts");
const schema = {
  name: {
    label: "名称",
    kind: "text",
    entries: ["quick", "normal", "advanced"],
    operators: ["eq", "contains"],
  },
  active: { label: "启用", kind: "boolean", entries: ["normal", "advanced"], operators: ["eq"] },
};
const snapshot = () => ({
  query: {
    quick: [],
    normal: [{ kind: "condition", id: "active", field: "active", operator: "eq", value: false }],
    advanced: null,
  },
  sort: { key: "name", order: "desc" },
});
let sequence = 0;
function setup(
  identity = ref({
    user: `preset-test-${++sequence}`,
    module: "base.sale",
    scope: "org-a",
    version: "1",
  }),
  extra = {}
) {
  const scope = effectScope(),
    calls = [];
  const state = scope.run(() =>
    useQueryPresets({
      config: { version: 1 },
      schema,
      sortKeys: ["name"],
      identity: () => identity.value,
      snapshot,
      apply: async (value) => {
        calls.push(value);
        return true;
      },
      ...extra,
    })
  );
  return { state, port: state.controller, calls, identity, close: () => scope.stop() };
}
test("查询方案保存、重命名、删除、默认与作用域隔离", async () => {
  const view = setup();
  assert.equal(await view.state.initialize(), false);
  assert.equal(await view.port.save(" 停用组织 "), true);
  assert.equal(await view.port.save("停用组织"), false);
  const id = view.port.items[0].id;
  assert.equal(await view.port.rename(id, "历史组织"), true);
  assert.equal(await view.port.setDefault(id), true);
  assert.equal(view.calls.length, 0);
  assert.equal(await view.state.initialize(), true);
  assert.deepEqual(view.calls, [snapshot()]);
  assert.equal(view.port.activeId, id);
  view.identity.value = { ...view.identity.value, scope: "org-b" };
  assert.equal(await view.state.initialize(), false);
  assert.equal(view.port.items.length, 0);
  view.identity.value = { ...view.identity.value, scope: "org-a" };
  await view.state.initialize();
  assert.equal(view.port.items[0].name, "历史组织");
  assert.equal(await view.port.remove(id), true);
  assert.equal(view.port.defaultId, null);
  assert.equal(view.port.activeId, null);
  view.close();
});
test("失效方案保留错误，默认方案不会退化为无条件查询", async () => {
  const first = setup();
  await first.state.initialize();
  await first.port.save("旧版方案");
  await first.port.setDefault(first.port.items[0].id);
  first.close();
  const next = setup(first.identity, { config: { version: 2 } });
  assert.equal(await next.state.initialize(), true);
  assert.equal(next.calls.length, 0);
  assert.match(next.port.error, /升级/);
  assert.match(next.port.items[0].issue, /升级/);
  assert.equal(await next.port.setDefault(null), true);
  next.close();
  const removed = snapshot();
  removed.query.normal[0].field = "removed";
  assert.throws(() => parseQueryPreset(removed, schema, ["name"]));
  assert.throws(() =>
    parseQueryPreset(
      snapshot(),
      { ...schema, active: { ...schema.active, entries: ["advanced"] } },
      ["name"]
    )
  );
  assert.throws(() =>
    parseQueryPreset({ ...snapshot(), sort: { key: "secret", order: "asc" } }, schema, ["name"])
  );
});
test("同范围并发写入冲突可重新读取，不覆盖其他页面方案", async () => {
  const left = setup(),
    right = setup(left.identity);
  await left.state.initialize();
  await right.state.initialize();
  assert.equal(await left.port.save("甲"), true);
  assert.equal(await right.port.save("乙"), false);
  await right.port.reload();
  assert.equal(await right.port.save("乙"), true);
  await left.port.reload();
  assert.deepEqual(
    left.port.items.map((item) => item.name),
    ["甲", "乙"]
  );
  left.close();
  right.close();
});
test("范围切换后旧读取不能应用默认值，卸载不回写", async () => {
  const original = userDataStore.read;
  const delayed = pending();
  userDataStore.read = () => delayed.promise;
  const view = setup();
  const loading = view.state.initialize();
  view.identity.value = { ...view.identity.value, scope: "org-b" };
  delayed.resolve({
    record: {
      schemaVersion: 1,
      revision: "old",
      value: {
        items: [{ id: "old", name: "旧组织", version: 1, snapshot: snapshot() }],
        defaultId: "old",
      },
    },
    level: "memory",
  });
  await loading;
  assert.equal(view.calls.length, 0);
  assert.equal(view.port.items.length, 0);
  view.close();
  userDataStore.read = original;
});
test("筛选与排序原子切换只请求一次，并回到第一页", async () => {
  const requests = [],
    scope = effectScope();
  const query = scope.run(() =>
    useSearchQuery({
      schema,
      scope: () => ({ key: "a", value: {} }),
      request: async (value) => {
        requests.push(value);
        return { list: [], total: 100 };
      },
    })
  );
  await query.setPage(2);
  requests.length = 0;
  await query.apply(snapshot().query, snapshot().sort);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pageNum, 1);
  assert.deepEqual(requests[0].sort, snapshot().sort);
  assert.equal(requests[0].where.children[0].value, false);
  scope.stop();
  await flush();
});

test("等待新范围默认方案时清空旧范围数据，取消旧请求后不遗留忙碌态", async () => {
  const scope = effectScope(),
    identity = ref("a"),
    delayed = pending();
  let scopeChanges = 0;
  const query = scope.run(() =>
    useSearchQuery(
      {
        schema,
        scope: () => ({ key: identity.value, value: {} }),
        request: async () => ({ list: [{ name: "旧组织" }], total: 1 }),
      },
      {
        scopeChanged: () => {
          scopeChanges++;
        },
      }
    )
  );
  await query.refresh();
  assert.equal(query.rows.value.length, 1);
  identity.value = "b";
  await flush();
  assert.equal(scopeChanges, 1);
  assert.equal(query.rows.value.length, 0);
  assert.equal(query.total.value, 0);
  assert.equal(query.loading.value, false);
  scope.stop();
  // 取消进行中的请求也不能让等待默认方案的列表一直显示 loading。
  const another = effectScope();
  const pendingQuery = another.run(() =>
    useSearchQuery(
      { schema, scope: () => ({ key: identity.value, value: {} }), request: () => delayed.promise },
      { scopeChanged: () => {} }
    )
  );
  const request = pendingQuery.refresh();
  identity.value = "c";
  await flush();
  assert.equal(pendingQuery.loading.value, false);
  delayed.resolve({ list: [{ name: "迟到" }], total: 1 });
  await request;
  assert.equal(pendingQuery.rows.value.length, 0);
  another.stop();
});
