import { test } from "node:test";
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
  resolve(specifier, context, next) {
    if (specifier === "async-validator") return next("async-validator/dist-web/index.js", context);
    return next(specifier, context);
  },
});
const customer = (await import("../mock/customer.mock.ts")).default;
const fee = (await import("../mock/task-fee.mock.ts")).default;
const reference = (await import("../mock/business-reference.mock.ts")).default;
const lab = (await import("../mock/query-lab.mock.ts")).default;
const { validateFieldModel } = await import("../src/components/business/fields/validation.ts");
const condition = (field, operator, value, id = field) => ({
  kind: "condition",
  id,
  field,
  operator,
  value,
});
const group = (children, operator = "or") => ({ kind: "group", id: "root", operator, children });
const body = (where = null, value = { organizationId: "org-a" }) => ({
  scope: { key: "scope", value },
  where,
  sort: null,
  pageNum: 1,
  pageSize: 10,
});
test("S2 客户和费用真实 Mock 端点先限定范围，再计算 OR/分页总数", async () => {
  for (const mocks of [customer, fee]) {
    const endpoint = mocks.find(
      (item) => item.url.endsWith("/search") && item.method.includes("POST")
    );
    const all = await endpoint.body({ body: body() });
    assert.equal(all.code, "00000");
    assert.ok(all.data.total > 0);
    const first = all.data.list[0];
    const key = mocks === customer ? "customerCode" : "billCode";
    const where = group([
      condition(key, "eq", first[key]),
      condition(key, "eq", "missing", "missing"),
    ]);
    const result = await endpoint.body({ body: body(where) });
    assert.equal(result.data.total, 1);
    assert.equal(result.data.list[0].id, first.id);
    const outside = await endpoint.body({ body: body(where, { organizationId: "org-b" }) });
    assert.equal(outside.data.total, 0);
    const invalid = await endpoint.body({
      body: body(group([condition("undeclared", "eq", "x")])),
    });
    assert.notEqual(invalid.code, "00000");
  }
});
test("S2 参照组合查询不能通过 OR 扩大省份/组织范围", async () => {
  const endpoint = reference.find((item) => item.url === "pilot/master-data/geography/query");
  assert.ok(endpoint);
  const scope = { organizationId: "org-a", level: "province", parentId: null };
  const where = group([condition("name", "contains", "江苏"), condition("id", "eq", "310100")]);
  const result = await endpoint.body({ body: body(where, scope) });
  assert.equal(result.code, "00000");
  assert.equal(result.data.total, 1);
  assert.equal(result.data.list[0].name, "江苏省");
});
test("S2 固定数字零客户范围在清空查询后仍生效", async () => {
  const endpoint = lab[0];
  const result = await endpoint.body({
    body: body(null, { organizationId: "org-a", customerId: 0 }),
  });
  assert.equal(result.data.total, 14);
  assert.ok(result.data.list.every((row) => row.customerId === 0));
  const resultOr = await endpoint.body({
    body: body(group([condition("id", "eq", 1), condition("id", "eq", 0, "zero")]), {
      organizationId: "org-a",
      customerId: 0,
    }),
  });
  assert.equal(resultOr.data.total, 1);
  assert.equal(resultOr.data.list[0].id, 0);
});
test("S2 主表与明细同源的邮箱、动态必填和严格日期格式校验", async () => {
  const fields = [
    {
      key: "email",
      label: "邮箱",
      type: "text",
      formatHint: "email",
      form: { required: ({ model }) => model.required },
    },
    { key: "date", label: "日期", type: "text", formatHint: "date", form: {} },
  ];
  const check = (model) =>
    validateFieldModel(fields, { model, mode: "edit", context: undefined, entities: {} });
  assert.equal((await check({ email: "", required: false, date: "" })).valid, true);
  const required = await check({ email: "", required: true, date: "" });
  assert.equal(required.valid, false);
  assert.equal(required.errors[0].field, "email");
  assert.equal(
    (await check({ email: "invalid", required: false, date: "2026-02-30" })).errors.length,
    2
  );
  assert.equal(
    (await check({ email: "valid@example.com", required: true, date: "2026-02-28" })).valid,
    true
  );
});
