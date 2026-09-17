import { test } from "node:test";
import assert from "node:assert/strict";
import { mount, pending, flush } from "./reference-harness.mjs";
import { isEmptyValue } from "../src/utils/validate.ts";

test("M5 共用空值规则明确边界，不混淆 0/false/空白/对象", () => {
  for (const value of [null, undefined, "", []]) assert.equal(isEmptyValue(value), true);
  for (const value of [0, false, " ", [null], {}, new Date(0)])
    assert.equal(isEmptyValue(value), false);
});
test("M5 参照条件应用同一空值规则并保留 0 与 false", async () => {
  const ctx = mount();
  ctx.props.source.searchFields = ["zero", "false", "blank", "empty", "list"].map((key) => ({
    key,
    label: key,
    type: "select",
    operator: "eq",
    options: [
      { label: "zero", value: 0 },
      { label: "false", value: false },
      { label: "blank", value: " " },
    ],
  }));
  ctx.state.conditionValues.value = { zero: 0, false: false, blank: " ", empty: "", list: [] };
  let query;
  ctx.props.source.search = async (value) => {
    query = value;
    return { list: [], total: 0 };
  };
  ctx.state.visible.value = true;
  await ctx.state.search();
  assert.deepEqual(
    query.conditions.map((item) => item.value),
    [0, false, " "]
  );
  ctx.close();
});
test("M5 卸载取消三个请求通道，无法取消的迟到失败不报告也不提交", async () => {
  const ctx = mount();
  await flush();
  const requests = [];
  const request = (context) => {
    const p = pending();
    requests.push({ p, signal: context.signal });
    return p.promise;
  };
  ctx.props.source.search = (_, context) => request(context);
  ctx.props.source.resolve = (_, __, context) => request(context);
  ctx.state.typing.value = true;
  ctx.state.keyword.value = "客户";
  const suggest = ctx.state.suggest();
  ctx.state.visible.value = true;
  const search = ctx.state.search();
  ctx.props.modelValue = 0;
  await flush();
  const baseline = ctx.events.length;
  ctx.close();
  assert.equal(requests.length, 3);
  assert.ok(requests.every((item) => item.signal.aborted));
  const afterClose = ctx.events.length;
  requests.forEach((item) => item.p.reject(new Error("late transport failure")));
  await Promise.all([suggest, search]);
  await flush();
  assert.equal(ctx.events.length, afterClose);
  assert.equal(
    ctx.events.slice(baseline).filter(([type]) => type === "commit" || type === "error").length,
    0
  );
});
