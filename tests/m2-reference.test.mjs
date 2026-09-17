import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mount,
  pending,
  flush,
  checkReferenceResolve,
  checkReferencePage,
} from "./reference-harness.mjs";
const { referenceIds, changeReferenceSelection, sameReferenceSelection } =
  await import("../src/components/business/MyReference/selection.ts");
const { checkReferenceConditions, referenceFilterKey } =
  await import("../src/components/business/MyReference/contract.ts");
const { parseDate, DATE_FORMAT } = await import("../src/utils/date.ts");
const { searchLab, resolveLab, readLabControls } = await import("../mock/reference-data.ts");
const row = (id) => ({ id, name: `名称${id}` });
const multiple = (overrides = {}) => mount({ multiple: true, modelValue: [], ...overrides });

test("有序去重保留 0 与字符串键，差量增减和上限不丢旧项", () => {
  assert.deepEqual(referenceIds([0, "0", 0, 2, "0"]), [0, "0", 2]);
  assert.deepEqual(changeReferenceSelection([0, "0"], [2, 3], true, 3), {
    ids: [0, "0"],
    allowed: false,
    reason: "最多选择 3 项，剩余 1 项",
  });
  assert.deepEqual(changeReferenceSelection([0, 2, 4], [2], false, 1).ids, [0, 4]);
  assert.equal(sameReferenceSelection([0, "0"], ["0", 0]), true);
  assert.equal(sameReferenceSelection([0], ["0"]), false);
});
test("多选快速增减直接提交，自己的回写不关闭候选，事件差量准确", async () => {
  const ctx = multiple();
  await flush();
  ctx.state.typing.value = true;
  await ctx.state.commit(row(0));
  await flush();
  assert.equal(ctx.state.typing.value, true);
  await ctx.state.commit(row(2));
  await flush();
  assert.deepEqual(ctx.props.modelValue, [0, 2]);
  await ctx.state.commit(row(0));
  await flush();
  assert.deepEqual(ctx.props.modelValue, [2]);
  const commits = ctx.events.filter(([type]) => type === "commit").map(([, data]) => data);
  assert.deepEqual(
    commits.map((value) => [value.addedIds, value.removedIds]),
    [
      [[0], []],
      [[2], []],
      [[], [0]],
    ]
  );
  assert.deepEqual(
    commits.at(-1).items.map((value) => value.id),
    [2]
  );
  ctx.close();
});
test("三页全选后取消当前页，只删当前可选 ID，顺序保持；取消不提交", async () => {
  const ctx = multiple();
  await ctx.state.open();
  await flush();
  ctx.props.source.selectable = (row) => ({ allowed: row.id !== 3 });
  ctx.state.rows.value = [row(0), row(1)];
  ctx.state.togglePage();
  ctx.state.rows.value = [row(2), row(3)];
  ctx.state.togglePage();
  ctx.state.rows.value = [row(4), row(5)];
  ctx.state.togglePage();
  assert.deepEqual(ctx.state.draftIds.value, [0, 1, 2, 4, 5]);
  ctx.state.togglePage();
  assert.deepEqual(ctx.state.draftIds.value, [0, 1, 2]);
  assert.deepEqual(ctx.props.modelValue, []);
  ctx.state.close();
  assert.equal(ctx.events.filter(([type]) => type === "commit").length, 0);
  ctx.close();
});
test("全选超限原子拒绝；达到上限仍允许取消已选及清空草稿", async () => {
  const ctx = multiple({ maxSelected: 1 });
  await ctx.state.open();
  await flush();
  ctx.state.rows.value = [row(0), row(2)];
  ctx.state.togglePage();
  assert.deepEqual(ctx.state.draftIds.value, []);
  ctx.state.chooseDraft(row(0));
  ctx.state.chooseDraft(row(2));
  assert.deepEqual(ctx.state.draftIds.value, [0]);
  ctx.props.source.selectable = () => ({ allowed: false });
  ctx.state.chooseDraft(row(0));
  assert.deepEqual(ctx.state.draftIds.value, []);
  ctx.state.draftIds.value = [0, 2];
  ctx.state.clearDraft();
  assert.deepEqual(ctx.state.draftIds.value, []);
  ctx.close();
});
test("弹窗确认一次事件，纯重排不回填，清空 items 为空", async () => {
  const ctx = multiple({ modelValue: [0, 2] });
  await flush();
  await ctx.state.commitIds([2, 0]);
  assert.equal(ctx.events.filter(([type]) => type === "commit").length, 0);
  await ctx.state.commitIds([0, 4]);
  await flush();
  assert.deepEqual(
    ctx.events.filter(([type]) => type === "update" || type === "commit").map(([type]) => type),
    ["update", "commit"]
  );
  await ctx.state.commit();
  assert.deepEqual(ctx.events.filter(([type]) => type === "commit").at(-1)[1].items, []);
  ctx.close();
});
test("未知 ID 合并回显，缓存区分数字/字符串并隔离输出对象", async () => {
  const ctx = multiple();
  let calls = 0;
  const requested = [];
  ctx.props.source.resolve = async (ids) => {
    calls++;
    requested.push([...ids]);
    return {
      items: ids.map((id) => ({ id, name: `${typeof id}:${id}`, nested: { count: 1 } })),
      unavailableIds: [],
    };
  };
  ctx.props.modelValue = [0, "0", 0];
  await flush();
  assert.deepEqual(requested, [[0, "0"]]);
  ctx.events.filter(([type]) => type === "resolve").at(-1)[1].items[0].nested.count = 99;
  ctx.props.modelValue = [2];
  await flush();
  ctx.props.modelValue = [0, "0"];
  await flush();
  assert.equal(calls, 2);
  assert.equal(ctx.state.selectedItems.value[0].nested.count, 1);
  assert.deepEqual(
    ctx.state.selectedItems.value.map((row) => row.name),
    ["number:0", "string:0"]
  );
  ctx.close();
});
test("filters 键顺序不失效，实际范围改变清缓存重查但不清模型", async () => {
  const ctx = multiple();
  let calls = 0;
  ctx.props.source.resolve = async (ids, filters) => {
    calls++;
    return { items: ids.map((id) => ({ id, name: filters.organizationId })), unavailableIds: [] };
  };
  ctx.props.filters = { organizationId: "a", active: false };
  ctx.props.modelValue = [0];
  await flush();
  ctx.props.filters = { active: false, organizationId: "a" };
  await flush();
  assert.equal(calls, 1);
  ctx.props.filters = { active: false, organizationId: "b" };
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(ctx.props.modelValue, [0]);
  assert.equal(ctx.state.selected.value.name, "b");
  ctx.close();
});
test("scope 强制清空绕过守卫，同批新模型按新范围回显", async () => {
  const ctx = multiple({ modelValue: [0], beforeCommit: () => ({ allowed: false }) });
  await flush();
  ctx.props.scopeKey = "b";
  await flush();
  assert.deepEqual(ctx.props.modelValue, []);
  assert.equal(
    ctx.events.filter(([type]) => type === "commit").at(-1)[1].reason,
    "dependency-clear"
  );
  ctx.props.scopeKey = "c";
  ctx.props.modelValue = [2];
  await flush();
  assert.deepEqual(ctx.props.modelValue, [2]);
  assert.equal(ctx.state.selected.value.id, 2);
  ctx.close();
});
test("source 替换和实例销毁不复用缓存，过期结果不写回", async () => {
  const ctx = multiple({ modelValue: [0] });
  await flush();
  const pendingResult = pending();
  ctx.props.source = { ...ctx.props.source, key: "new", resolve: () => pendingResult.promise };
  ctx.props.modelValue = [2];
  await flush();
  ctx.close();
  const count = ctx.events.length;
  pendingResult.resolve({ items: [row(2)], unavailableIds: [] });
  await flush();
  assert.equal(ctx.events.length, count);
  const another = multiple({ modelValue: [0] });
  await flush();
  assert.equal(another.events.filter(([type]) => type === "resolve").length, 2);
  another.close();
});
test("每次提交强制请求；缓存中记录失效或请求失败均保留模型", async () => {
  const ctx = multiple({ modelValue: [0] });
  await flush();
  let calls = 0;
  ctx.props.source.resolve = async (ids) => {
    calls++;
    return { items: ids.filter((id) => id !== 0).map(row), unavailableIds: [0] };
  };
  assert.equal(await ctx.state.commitIds([0, 2]), false);
  assert.equal(calls, 1);
  assert.deepEqual(ctx.props.modelValue, [0]);
  ctx.props.source.resolve = async () => {
    throw new Error("网络失败");
  };
  assert.equal(await ctx.state.commitIds([0, 2]), false);
  assert.equal(ctx.state.guardError.value, "网络失败");
  assert.deepEqual(ctx.props.modelValue, [0]);
  ctx.close();
});
test("部分 unavailable 保留各 ID；有效性校验也检查 maxSelected", async () => {
  const ctx = multiple({ maxSelected: 1 });
  ctx.props.source.resolve = async () => ({ items: [row(0)], unavailableIds: [2] });
  ctx.props.modelValue = [0, 2];
  await flush();
  assert.deepEqual(ctx.state.unavailableIds.value, [2]);
  assert.deepEqual(ctx.props.modelValue, [0, 2]);
  assert.equal((await ctx.state.resolveSelection()).allowed, false);
  ctx.props.source.resolve = async (ids) => ({ items: ids.map(row), unavailableIds: [] });
  const result = await ctx.state.resolveSelection();
  assert.equal(result.allowed, false);
  assert.match(result.reason, /最多选择/);
  ctx.close();
});
test("beforeCommit 收到独立副本，不能修改最终 ID/缓存记录", async () => {
  const ctx = multiple({
    beforeCommit: (payload) => {
      payload.value.push(999);
      payload.items[0].id = 999;
      return { allowed: true };
    },
  });
  await ctx.state.commit(row(0));
  await flush();
  assert.deepEqual(ctx.props.modelValue, [0]);
  assert.equal(ctx.events.filter(([type]) => type === "commit").at(-1)[1].items[0].id, 0);
  assert.equal(ctx.state.selected.value.id, 0);
  ctx.close();
});
test("beforeOpen 等待中换范围/取消/卸载全部失效", async () => {
  for (const action of [
    (ctx) => {
      ctx.props.scopeKey = "b";
    },
    (ctx) => {
      ctx.props.filters = { organizationId: "b" };
    },
    (ctx) => ctx.state.close(),
    (ctx) => ctx.close(),
  ]) {
    const gate = pending(),
      ctx = multiple({ beforeOpen: () => gate.promise });
    const promise = ctx.state.open();
    action(ctx);
    await flush();
    gate.resolve({ allowed: true });
    assert.equal(await promise, false);
    ctx.close();
  }
});
test("beforeCommit 等待中改条件或原地改外部数组不能覆盖父值", async () => {
  for (const action of [
    (ctx) => {
      ctx.props.filters = { organizationId: "b" };
    },
    (ctx) => {
      ctx.props.modelValue.push(4);
    },
    (ctx) => ctx.state.close(),
  ]) {
    const gate = pending(),
      ctx = multiple({ modelValue: [0], beforeCommit: () => gate.promise });
    await flush();
    const promise = ctx.state.commit(row(2));
    await flush();
    action(ctx);
    await flush();
    gate.resolve({ allowed: true });
    assert.equal(await promise, false);
    assert.equal(ctx.events.filter(([type]) => type === "commit").length, 0);
    ctx.close();
  }
});
test("筛选白名单保留 false，日期必须是真实有序日历日期", () => {
  const fields = [
    {
      key: "active",
      label: "状态",
      type: "select",
      operator: "eq",
      options: [{ value: false, label: "停用" }],
    },
    { key: "date", label: "日期", type: "dateRange", operator: "between" },
  ];
  assert.doesNotThrow(() =>
    checkReferenceConditions(fields, [{ key: "active", operator: "eq", value: false }])
  );
  for (const value of [["2026-02-30", "2026-03-01"], ["2026-03-01", "2026-02-01"], ["2026-01-01"]])
    assert.throws(() =>
      checkReferenceConditions(fields, [{ key: "date", operator: "between", value }])
    );
  assert.throws(() =>
    checkReferenceConditions(fields, [{ key: "organizationId", operator: "eq", value: "b" }])
  );
  assert.equal(parseDate("2024-02-29", DATE_FORMAT) !== null, true);
  assert.equal(parseDate("2025-02-29", DATE_FORMAT) !== null, false);
  assert.equal(parseDate(" 2026-01-01", DATE_FORMAT) !== null, false);
  assert.equal(referenceFilterKey({ z: 0, a: false }), referenceFilterKey({ a: false, z: 0 }));
});
test("弹窗条件与 filters 分开，重置恢复第一页与空条件", async () => {
  const ctx = multiple();
  const queries = [];
  ctx.props.source.searchFields = [
    { key: "name", label: "名称", type: "text", operator: "contains" },
  ];
  ctx.props.source.search = async (query) => {
    queries.push(query);
    return { list: [], total: 0 };
  };
  await ctx.state.open();
  ctx.state.conditionValues.value = { name: "客户", organizationId: "b" };
  ctx.state.page.value = 3;
  await ctx.state.search();
  assert.deepEqual(queries.at(-1).conditions, [
    { key: "name", operator: "contains", value: "客户" },
  ]);
  assert.deepEqual(queries.at(-1).filters, { organizationId: "a" });
  ctx.state.resetSearch();
  await flush();
  assert.equal(queries.at(-1).pageNum, 1);
  assert.deepEqual(queries.at(-1).conditions, []);
  ctx.close();
});
test("Mock 日期范围/组织交集、重复键与部分不可用可确定复现", () => {
  const filters = { organizationId: "org-a" };
  const query = {
    keyword: "",
    filters,
    conditions: [{ key: "listedDate", operator: "between", value: ["2026-01-01", "2026-01-05"] }],
    pageNum: 1,
    pageSize: 10,
    purpose: "dialog",
  };
  const data = searchLab("products", query);
  assert.ok(
    data.list.every((row) => row.organizationId === "org-a" && row.listedDate <= "2026-01-05")
  );
  assert.throws(() =>
    checkReferencePage(searchLab("products", query, false, true), (row) => row.id, 10)
  );
  const result = resolveLab("products", ["0", "product-2"], filters, false, true);
  assert.deepEqual(result.unavailableIds, ["0"]);
  assert.equal(result.items[0].id, "product-2");
  assert.throws(() =>
    checkReferenceResolve(
      resolveLab("products", ["0"], filters, false, false, true),
      ["0"],
      (row) => row.id
    )
  );
  assert.throws(() => readLabControls({ failResolve: "true" }));
});
test("不在运行中转换模式；错误模型可见且不能提交", async () => {
  const ctx = multiple();
  ctx.props.multiple = false;
  await flush();
  assert.match(ctx.state.modelError.value, /重新创建/);
  assert.equal(await ctx.state.commit(row(0)), false);
  ctx.close();
});

test("打开时尚在回显的已选项完成后补入草稿记录，不改变草稿 ID", async () => {
  const ctx = multiple();
  const delayed = pending();
  ctx.props.source.resolve = () => delayed.promise;
  ctx.props.modelValue = [0];
  await flush();
  await ctx.state.open();
  assert.deepEqual(ctx.state.draftIds.value, [0]);
  delayed.resolve({ items: [row(0)], unavailableIds: [] });
  await flush();
  assert.equal(ctx.state.draftRecords.value.get(0).id, 0);
  assert.deepEqual(ctx.state.draftIds.value, [0]);
  ctx.close();
});
