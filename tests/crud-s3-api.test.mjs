import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import "./reference-harness.mjs";
registerHooks({
  load(url, context, next) {
    if (url.endsWith("/mock/base.ts"))
      return {
        format: "module",
        source: "export const defineMock = value => value;",
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const endpoints = (await import("../mock/crud-lab.mock.ts")).default;
const call = (url, method, value) =>
  endpoints.find((item) => item.url === url && item.method.includes(method)).body(value);

test("S3 真实 Mock 主子表创建、回执回填、版本冲突与删除闭环", async () => {
  const payload = {
    organizationId: "org-a",
    title: "  整单测试  ",
    billDate: "2026-09-10",
    amount: "0.105",
    category: "regular",
    note: "备注",
    lines: [{ id: "new", name: "明细", quantity: 2 }],
  };
  const created = await call("crud-lab", "POST", { body: payload });
  assert.equal(created.code, "00000");
  assert.deepEqual(Object.keys(created.data).sort(), ["id", "version"]);
  const params = { id: String(created.data.id) },
    query = { organizationId: "org-a" };
  const loaded = await call("crud-lab/:id", "GET", { params, query });
  assert.equal(loaded.data.title, "整单测试");
  assert.equal(loaded.data.amount, "0.11");
  assert.equal(loaded.data.lines[0].quantity, 2);
  const stale = await call("crud-lab/:id", "PUT", { params, body: { ...payload, version: 0 } });
  assert.notEqual(stale.code, "00000");
  const bad = await call("crud-lab/:id", "PUT", {
    params,
    body: {
      ...payload,
      version: 1,
      title: "不应落地",
      lines: [{ id: "new", name: "", quantity: 0 }],
    },
  });
  assert.notEqual(bad.code, "00000");
  const unchanged = await call("crud-lab/:id", "GET", { params, query });
  assert.equal(unchanged.data.title, "整单测试");
  const updated = await call("crud-lab/:id", "PUT", {
    params,
    body: { ...payload, version: 1, lines: [{ id: "new", name: "更新明细", quantity: 3 }] },
  });
  assert.equal(updated.data.version, 2);
  const hidden = await call("crud-lab/:id", "GET", { params, query: { organizationId: "org-b" } });
  assert.notEqual(hidden.code, "00000");
  await call("crud-lab/:id", "DELETE", { params, body: query });
  const removed = await call("crud-lab/:id", "GET", { params, query });
  assert.notEqual(removed.code, "00000");
});

test("S3 列表查询共用 AST 与范围，ID 0 正常回填", async () => {
  const zero = await call("crud-lab/:id", "GET", {
    params: { id: "0" },
    query: { organizationId: "org-a" },
  });
  assert.equal(zero.data.id, 0);
  assert.equal(zero.data.lines.length, 12);
  const body = {
    scope: { key: "org-a", value: { organizationId: "org-a" } },
    where: {
      kind: "group",
      id: "root",
      operator: "and",
      children: [
        { kind: "condition", id: "name", field: "title", operator: "contains", value: "样例" },
      ],
    },
    pageNum: 1,
    pageSize: 10,
    sort: { key: "amount", order: "asc" },
  };
  const found = await call("crud-lab/search", "POST", { body });
  assert.equal(found.data.total, 21);
  assert.equal(found.data.list[0].id, 0);
  const out = await call("crud-lab/search", "POST", {
    body: { ...body, scope: { key: "b", value: { organizationId: "org-b" } } },
  });
  assert.equal(out.data.total, 0);
});
