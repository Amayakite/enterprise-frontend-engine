import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer, h, ref } from "vue";
import { flush, pending, mount as mountReference } from "./reference-harness.mjs";
const { applyQueryDraft, createQueryDraft, parseQueryWhere, removeQueryNode, querySummary } =
  await import("../src/components/business/search/model.ts");
const { queryRecords } = await import("../src/components/business/search/evaluate.ts");
const { queryLabSchema: schema } = await import("../src/api/query-lab/query.ts");
const { useSearchQuery } = await import("../src/composables/useSearchQuery.ts");
const condition = (field, operator, value, id = `${field}:${operator}`) => ({
  kind: "condition",
  id,
  field,
  operator,
  ...(value === undefined ? {} : { value }),
});
const group = (children, operator = "and", id = "root") => ({
  kind: "group",
  id,
  operator,
  children,
});
const applyAdvanced = (advanced) =>
  applyQueryDraft(schema, { ...createQueryDraft(schema), advanced });
const rows = [
  {
    id: 0,
    name: "Alpha",
    active: false,
    customerId: 0,
    billDate: "2026-09-01",
    amount: "9007199254740993.01",
    gender: "0",
    email: "",
  },
  {
    id: 1,
    name: "Beta",
    active: true,
    customerId: 1,
    billDate: "2026-09-02",
    amount: "9007199254740993.02",
    gender: "1",
    email: "a@example.com",
  },
  {
    id: 2,
    name: "Alpha 2",
    active: true,
    customerId: 0,
    billDate: "2026-09-03",
    amount: "0.00",
    gender: "2",
    email: "",
  },
];
test("S2 参照树查询复用固定范围，跨查询草稿保留且取消不提交", async () => {
  const view = mountReference({ multiple: true, modelValue: [] });
  const requests = [];
  view.props.source.query = {
    schema,
    request: async (query) => {
      requests.push(query);
      return { list: rows, total: rows.length };
    },
  };
  view.props.source.search = async () => {
    throw new Error("弹窗不应降级到旧 search");
  };
  await view.state.open();
  await flush();
  view.state.chooseDraft(rows[0]);
  const applied = applyAdvanced(group([condition("id", "eq", 1)])).applied;
  assert.equal(await view.state.applyQuery(applied), true);
  assert.deepEqual(view.state.draftIds.value, [0]);
  assert.equal(requests.at(-1).scope.value.organizationId, "a");
  assert.equal(requests.at(-1).where.children[0].children[0].value, 1);
  view.state.close();
  assert.deepEqual(view.props.modelValue, []);
  assert.equal(
    view.events.some(([type]) => type === "commit"),
    false
  );
  view.close();
});
test("S2 参照树查询的迟到结果不能覆盖更新查询", async () => {
  const view = mountReference();
  const requests = [];
  view.props.source.query = {
    schema,
    request: () => {
      const deferred = pending();
      requests.push(deferred);
      return deferred.promise;
    },
  };
  await view.state.open();
  await flush();
  const latest = view.state.applyQuery(applyAdvanced(group([condition("id", "eq", 1)])).applied);
  requests[1].resolve({ list: [rows[1]], total: 1 });
  await latest;
  requests[0].resolve({ list: [rows[0]], total: 1 });
  await flush();
  assert.equal(view.state.rows.value[0].id, 1);
  view.close();
});
const search = (where, options = {}) =>
  queryRecords(
    rows,
    schema,
    { where, pageNum: 1, pageSize: 10, ...options },
    { getKey: (row) => row.id, values: (row, key) => [row[key]], sortKeys: ["id", "amount"] }
  );
test("S2 AND/OR 组合、摘要与移除保持分组关系", () => {
  const parsed = applyAdvanced(
    group([condition("name", "eq", " alpha "), condition("id", "eq", 1)], "or")
  );
  assert.equal(parsed.valid, true);
  assert.deepEqual(
    search(parsed.where).list.map((row) => row.id),
    [0, 1]
  );
  assert.match(querySummary(schema, parsed.applied.advanced), / 或 /);
  const removed = removeQueryNode(parsed.applied, "id:eq");
  assert.equal(removed.advanced.children.length, 1);
  assert.equal(removed.advanced.operator, "or");
  assert.equal(removeQueryNode(removed, "name:eq").advanced, null);
});
test("S2 0、false、严格 ID、空数组、邮箱空值及闭区间", () => {
  assert.deepEqual(
    search(group([condition("customerId", "eq", 0), condition("active", "eq", false)])).list.map(
      (row) => row.id
    ),
    [0]
  );
  assert.equal(parseQueryWhere(schema, group([condition("customerId", "eq", "0")])).valid, false);
  assert.equal(parseQueryWhere(schema, group([condition("customerId", "in", [])])).valid, false);
  assert.deepEqual(
    search(group([condition("email", "isEmpty")])).list.map((row) => row.id),
    [0, 2]
  );
  assert.deepEqual(
    search(group([condition("billDate", "between", ["2026-09-01", "2026-09-02"])])).list.map(
      (row) => row.id
    ),
    [0, 1]
  );
  assert.equal(applyAdvanced(group([condition("billDate", "eq", "2026-02-30")])).valid, false);
  assert.equal(
    applyAdvanced(group([condition("billDate", "between", ["2026-09-03", "2026-09-01"])])).valid,
    false
  );
  assert.equal(search(group([condition("amount", "eq", "9007199254740993.02")])).list[0].id, 1);
});
test("S2 非法运算符、字段、空组、重复标识及数量/深度限制", () => {
  for (const node of [
    condition("id", "contains", "1"),
    condition("__proto__", "eq", "x"),
    condition("active", "eq", "false"),
    condition("email", "isEmpty", ""),
  ])
    assert.equal(applyAdvanced(group([node])).valid, false);
  assert.equal(applyAdvanced(group([])).valid, true);
  assert.equal(applyAdvanced(group([group([], "or", "empty")])).valid, false);
  assert.equal(
    applyAdvanced(group([condition("id", "eq", 1), condition("id", "eq", 2)])).valid,
    false
  );
  assert.equal(
    applyAdvanced(group(Array.from({ length: 51 }, (_, i) => condition("id", "eq", i, `c${i}`))))
      .valid,
    false
  );
  let nested = group([condition("id", "eq", 1)], "and", "g4");
  for (let i = 3; i > 0; i--) nested = group([nested], "and", `g${i}`);
  assert.equal(applyAdvanced(nested).valid, false);
  assert.throws(() => search(null, { sort: { key: "email", order: "asc" } }), /排序/);
  assert.throws(() => search(null, { pageSize: 101 }), /分页/);
});
test("S2 查询草稿不共享已应用数组，分页总数与精确金额排序", () => {
  const parsed = applyAdvanced(group([condition("gender", "in", ["0", "2"])]));
  assert.equal(parsed.valid, true);
  const draft = createQueryDraft(schema, parsed.applied);
  draft.advanced.children[0].value.push("1");
  assert.deepEqual(parsed.applied.advanced.children[0].value, ["0", "2"]);
  const page = search(null, { pageSize: 1, pageNum: 2, sort: { key: "amount", order: "asc" } });
  assert.equal(page.total, 3);
  assert.equal(page.list[0].id, 0);
});
test("S2 查询文本长度限制不截断对长备注的匹配", () => {
  const result = queryRecords(
    [{ id: 1, name: `${"长".repeat(300)}Alpha` }],
    schema,
    { where: group([condition("name", "contains", "alpha")]), pageNum: 1, pageSize: 10 },
    { getKey: (row) => row.id, values: (row, key) => [row[key]], sortKeys: ["id"] }
  );
  assert.equal(result.total, 1);
  assert.equal(applyAdvanced(group([condition("name", "contains", "a".repeat(257))])).valid, false);
});
const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {},
});
function mount() {
  const scope = ref({ key: "a", value: { organizationId: "a", customerId: 0 } });
  const calls = [];
  let state;
  const app = renderer.createApp({
    setup() {
      state = useSearchQuery({
        schema,
        scope: () => scope.value,
        pageSize: 10,
        request: (query, context) => {
          const deferred = pending();
          calls.push({ query, context, ...deferred });
          return deferred.promise;
        },
      });
      return () => h("div");
    },
  });
  app.mount({});
  return { state, calls, scope, close: () => app.unmount() };
}
test("S2 最新请求胜出、固定范围变化清理与卸载保护", async () => {
  const view = mount();
  const first = view.state.refresh(),
    second = view.state.refresh();
  assert.equal(view.calls[0].context.signal.aborted, true);
  view.calls[1].resolve({ list: [{ id: 2 }], total: 1 });
  await second;
  view.calls[0].resolve({ list: [{ id: 1 }], total: 1 });
  await first;
  assert.equal(view.state.rows.value[0].id, 2);
  view.scope.value = { key: "b", value: { organizationId: "b", customerId: 0 } };
  await flush();
  assert.deepEqual(view.state.rows.value, []);
  assert.deepEqual(view.calls[2].query.scope.value, { organizationId: "b", customerId: 0 });
  view.close();
  view.calls[2].resolve({ list: [{ id: 3 }], total: 1 });
  await flush();
  assert.deepEqual(view.state.rows.value, []);
});
test("S2 应用回首页、刷新保留、重置和页大小只触发一次", async () => {
  const view = mount();
  const page = view.state.setPage(3);
  assert.equal(view.calls.length, 1);
  view.calls[0].resolve({ list: [], total: 30 });
  await page;
  const value = applyAdvanced(group([condition("id", "eq", 0)])).applied;
  const applied = view.state.apply(value);
  assert.equal(view.calls[1].query.pageNum, 1);
  assert.equal(view.calls[1].query.scope.value.customerId, 0);
  view.calls[1].resolve({ list: [rows[0]], total: 1 });
  await applied;
  const refresh = view.state.refresh();
  assert.deepEqual(view.calls[2].query.where, view.calls[1].query.where);
  view.calls[2].reject(new Error("测试失败"));
  await refresh;
  assert.equal(view.state.error.value, "测试失败");
  assert.equal(view.state.loading.value, false);
  const reset = view.state.reset();
  assert.equal(view.calls[3].query.where, null);
  assert.equal(view.calls[3].query.scope.value.customerId, 0);
  view.calls[3].resolve({ list: [], total: 0 });
  await reset;
  const size = view.state.setPage(3, 20);
  assert.equal(view.calls.length, 5);
  assert.equal(view.calls[4].query.pageNum, 1);
  view.calls[4].resolve({ list: [], total: 0 });
  await size;
  await view.state.setPage(1, 20);
  assert.equal(view.calls.length, 5);
  view.close();
});
