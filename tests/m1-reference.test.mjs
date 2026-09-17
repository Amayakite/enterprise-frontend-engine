import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mount,
  pending,
  flush,
  checkReferencePage,
  checkReferenceResolve,
} from "./reference-harness.mjs";

test("回显完整性保留 ID 类型并拒绝漏项/重复/未请求 ID；分页拒绝无效 total", () => {
  const getKey = (row) => row.id;
  assert.doesNotThrow(() =>
    checkReferenceResolve({ items: [{ id: 0 }, { id: "0" }], unavailableIds: [] }, [0, "0"], getKey)
  );
  for (const result of [
    { items: [], unavailableIds: [] },
    { items: [{ id: 0 }], unavailableIds: [0] },
    { items: [{ id: "0" }], unavailableIds: [] },
  ])
    assert.throws(() => checkReferenceResolve(result, [0], getKey));
  assert.throws(() => checkReferencePage({ list: [{ id: 0 }], total: 0 }, getKey, 8));
});
test("无法取消的旧 suggest 及其 finally 不覆盖新结果/loading", async () => {
  const ctx = mount();
  const first = pending(),
    second = pending();
  let count = 0;
  ctx.props.source.search = () => (++count === 1 ? first.promise : second.promise);
  ctx.state.typing.value = true;
  ctx.state.keyword.value = "旧";
  const a = ctx.state.suggest();
  ctx.state.keyword.value = "新";
  const b = ctx.state.suggest();
  first.resolve({ list: [{ id: 1, name: "旧" }], total: 1 });
  await a;
  assert.equal(ctx.state.suggesting.value, true);
  assert.deepEqual(ctx.state.suggestions.value, []);
  second.resolve({ list: [{ id: 2, name: "新" }], total: 1 });
  await b;
  assert.equal(ctx.state.suggestions.value[0].id, 2);
  assert.equal(ctx.state.suggesting.value, false);
  ctx.close();
});
test("组合输入不查询；取消输入保留已提交 0；回显不 commit", async () => {
  const ctx = mount({ modelValue: 0 });
  await flush();
  let calls = 0;
  ctx.props.source.search = async () => {
    calls++;
    return { list: [], total: 0 };
  };
  ctx.state.compositionStart();
  ctx.state.keyword.value = "中文";
  await ctx.state.suggest();
  assert.equal(calls, 0);
  ctx.state.stopTyping();
  assert.equal(ctx.props.modelValue, 0);
  assert.equal(ctx.state.label.value, "客户0");
  assert.equal(ctx.events.filter(([type]) => type === "commit").length, 0);
  ctx.close();
});
test("关闭使未完成的 beforeOpen/beforeCommit 失效", async () => {
  const guard = pending();
  const ctx = mount({ beforeOpen: () => guard.promise });
  const opening = ctx.state.open();
  ctx.state.close();
  guard.resolve({ allowed: true });
  assert.equal(await opening, false);
  const commitGuard = pending();
  ctx.props.beforeCommit = () => commitGuard.promise;
  const committing = ctx.state.commit({ id: 0, name: "零" });
  ctx.state.close();
  commitGuard.resolve({ allowed: true });
  assert.equal(await committing, false);
  assert.equal(ctx.props.modelValue, null);
  ctx.close();
});
test("父级更新关闭弹窗并丢弃草稿，守卫不能覆盖外部值", async () => {
  const ctx = mount();
  await ctx.state.open();
  const guard = pending();
  ctx.props.beforeCommit = () => guard.promise;
  const committing = ctx.state.commit({ id: 2, name: "二" });
  ctx.props.modelValue = 4;
  await flush();
  assert.equal(ctx.state.visible.value, false);
  guard.resolve({ allowed: true });
  assert.equal(await committing, false);
  assert.equal(ctx.props.modelValue, 4);
  ctx.close();
});
test("提交事件同次同步调用 update 在 commit 前；同值不重复回填", async () => {
  const ctx = mount();
  await ctx.state.commit({ id: 0, name: "零" });
  await flush();
  assert.deepEqual(
    ctx.events.filter(([type]) => type === "update" || type === "commit").map(([type]) => type),
    ["update", "commit"]
  );
  await ctx.state.commit({ id: 0, name: "新名称" });
  assert.equal(ctx.events.filter(([type]) => type === "commit").length, 1);
  await ctx.state.commit();
  assert.equal(ctx.events.filter(([type]) => type === "commit").at(-1)[1].items.length, 0);
  ctx.close();
});
test("force resolve 不采用显示缓存，停用/失败保留 ID 并阻止校验", async () => {
  const ctx = mount({ modelValue: 0 });
  await flush();
  ctx.props.source.resolve = async () => ({ items: [], unavailableIds: [0] });
  assert.equal((await ctx.state.resolveSelection()).allowed, false);
  assert.equal(ctx.props.modelValue, 0);
  assert.equal(ctx.state.unavailable.value, true);
  ctx.props.source.resolve = async () => {
    throw new Error("离线");
  };
  assert.equal((await ctx.state.resolveSelection()).allowed, false);
  assert.equal(ctx.state.resolveError.value, "离线");
  ctx.close();
});
test("三个通道独立；旧 resolve 不能覆盖最新模型回显", async () => {
  const ctx = mount();
  const a = pending(),
    b = pending();
  let count = 0;
  ctx.props.source.resolve = () => (++count === 1 ? a.promise : b.promise);
  ctx.props.modelValue = 0;
  await flush();
  ctx.props.modelValue = 2;
  await flush();
  a.resolve({ items: [{ id: 0, name: "旧" }], unavailableIds: [] });
  await flush();
  assert.equal(ctx.state.resolving.value, true);
  b.resolve({ items: [{ id: 2, name: "新" }], unavailableIds: [] });
  await flush();
  assert.equal(ctx.state.label.value, "新");
  ctx.close();
});
test("普通 filters 保留值重查；scope 强制清空绕过业务守卫", async () => {
  const ctx = mount({ modelValue: 0, beforeCommit: () => ({ allowed: false }) });
  await flush();
  ctx.props.filters = { organizationId: "b" };
  await flush();
  assert.equal(ctx.props.modelValue, 0);
  ctx.props.scopeKey = "b";
  await flush();
  assert.equal(ctx.props.modelValue, null);
  assert.equal(
    ctx.events.filter(([type]) => type === "commit").at(-1)[1].reason,
    "dependency-clear"
  );
  ctx.close();
});

test("弹窗乱序查询不影响独立回显，旧查询不能结束新 loading", async () => {
  const ctx = mount({ modelValue: 0 });
  await flush();
  const resolving = pending(),
    first = pending(),
    second = pending();
  ctx.props.source.resolve = () => resolving.promise;
  let count = 0;
  ctx.props.source.search = () => (++count === 1 ? first.promise : second.promise);
  const resolution = ctx.state.resolveSelection();
  await ctx.state.open();
  const search = ctx.state.search();
  first.resolve({ list: [{ id: 2, name: "旧" }], total: 1 });
  await flush();
  assert.equal(ctx.state.searching.value, true);
  second.resolve({ list: [{ id: 4, name: "新" }], total: 1 });
  await search;
  assert.equal(ctx.state.rows.value[0].id, 4);
  assert.equal(ctx.state.resolving.value, true);
  resolving.resolve({ items: [{ id: 0, name: "零" }], unavailableIds: [] });
  await resolution;
  assert.equal(ctx.state.selected.value.id, 0);
  assert.equal(ctx.state.searching.value, false);
  ctx.close();
});
