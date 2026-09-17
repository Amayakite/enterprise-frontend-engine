import { test } from "node:test";
import assert from "node:assert/strict";
import "./reference-harness.mjs";
const { compileFieldQuery } = await import("../src/components/business/crud/field-query.ts");
const { createQueryDraft, parseQueryWhere } =
  await import("../src/components/business/search/model.ts");
const { evaluateQuery } = await import("../src/components/business/search/evaluate.ts");
const { customerQuerySchema } = await import("../mock/customer-query.ts");

const field = (key, type, query = { normal: true, advanced: true }, extra = {}) => ({
  key,
  label: key,
  type,
  scenes: { query },
  ...extra,
});
const condition = (field, value, operator = "eq", id = field) => ({
  kind: "condition",
  field,
  operator,
  value,
  id,
});
const root = (...children) => ({ kind: "group", id: "root", operator: "and", children });

test("字段自动推导默认操作符、入口、静态选项，未登记字段不参与", () => {
  const fields = [
    field("name", "text", { normal: true, advanced: true, keyword: true }),
    field("price", "amount"),
    field("count", "number"),
    field("day", "date"),
    field("time", "datetime"),
    field("active", "switch"),
    field("status", "select", undefined, { options: [{ label: "有效", value: 0 }] }),
    field("owner", "reference", { normal: true, valueType: "number" }),
    { key: "hidden", label: "隐藏", type: "text", scenes: {} },
  ];
  const original = structuredClone(fields);
  const { schema } = compileFieldQuery(fields);
  assert.equal(schema.name.operators[0], "contains");
  assert.equal(schema.price.kind, "decimal");
  assert.equal(schema.price.operators[0], "eq");
  assert.equal(schema.day.operators[0], "between");
  assert.equal(schema.time.operators[0], "between");
  assert.equal(schema.active.operators[0], "eq");
  assert.equal(schema.owner.valueType, "number");
  assert.deepEqual(schema.status.options, fields[6].options);
  assert.equal(schema.hidden, undefined);
  assert.deepEqual(schema.keyword.entries, ["quick"]);
  const draft = createQueryDraft(schema);
  assert.equal(draft.normal.find((x) => x.field === "day").operator, "between");
  assert.deepEqual(fields, original);
});

test("动态字典继承 key/值类型，0 与 false 不丢失；静态枚举仍严格校验", () => {
  const { schema } = compileFieldQuery([
    field("status", "dict", undefined, { dict: { code: "status", valueType: "number" } }),
    field("active", "switch"),
    field("fixed", "select", undefined, { options: [{ label: "一", value: "one" }] }),
  ]);
  assert.deepEqual(schema.status.dictionary, { code: "status", valueType: "number" });
  assert.equal(
    parseQueryWhere(schema, root(condition("status", 0), condition("active", false))).valid,
    true
  );
  assert.equal(parseQueryWhere(schema, root(condition("status", "0"))).valid, false);
  assert.equal(parseQueryWhere(schema, root(condition("status", NaN))).valid, false);
  assert.equal(parseQueryWhere(schema, root(condition("fixed", "two"))).valid, false);
});

test("覆盖整体替换默认操作符，不兼容与空数组快速失败", () => {
  const { schema } = compileFieldQuery([
    field("name", "text", { normal: true, operators: ["eq"] }),
  ]);
  assert.deepEqual(schema.name.operators, ["eq"]);
  assert.throws(
    () => compileFieldQuery([field("n", "number", { operators: ["contains"] })]),
    /不兼容/
  );
  assert.throws(() => compileFieldQuery([field("n", "number", { operators: [] })]), /不兼容/);
  assert.throws(() => compileFieldQuery([field("n", "number", { keyword: true })]), /关键词/);
  assert.throws(
    () => compileFieldQuery([field("n", "text", { keyword: true, operators: ["eq"] })]),
    /关键词/
  );
  assert.throws(() => compileFieldQuery([field("n", "custom")]), /暂不支持/);
  assert.throws(
    () =>
      compileFieldQuery([
        field("n", "dict", {}, { dict: { code: () => "x", valueType: "string" } }),
      ]),
    /静态/
  );
  assert.throws(
    () => compileFieldQuery([field("n", "text"), field("other", "text", { key: "n" })]),
    /重复/
  );
  assert.throws(() => compileFieldQuery([field("keyword", "text")]), /保留/);
});

test("关键词展开为 OR，与其他条件保持 AND；Mock 接受展开后的 DTO", () => {
  const { expand } = compileFieldQuery([
    field("customerName", "text", { keyword: true }),
    field("customerCode", "text", { keyword: true }),
    field("active", "switch"),
  ]);
  const input = root(condition("keyword", "KH", "contains"), condition("active", false));
  const before = structuredClone(input);
  const where = expand(input);
  assert.equal(where.children[0].operator, "or");
  assert.deepEqual(
    where.children[0].children.map((x) => x.field),
    ["customerName", "customerCode"]
  );
  assert.equal(parseQueryWhere(customerQuerySchema, where).valid, true);
  assert.deepEqual(input, before);
  assert.equal(
    evaluateQuery(customerQuerySchema, where, (key) => [
      { customerName: "客户", customerCode: "KH001", active: false }[key],
    ]),
    true
  );
  assert.equal(
    evaluateQuery(customerQuerySchema, where, (key) => [
      { customerName: "客户", customerCode: "KH001", active: true }[key],
    ]),
    false
  );
  assert.equal(expand(null), null);
});

test("展开仍执行复杂度与字段检查，不因快捷查询绕过白名单", () => {
  const { expand } = compileFieldQuery(
    Array.from({ length: 51 }, (_, i) => field(`name${i}`, "text", { keyword: true }))
  );
  assert.throws(() => expand(root(condition("keyword", "a", "contains"))), /条件|数量|最多|超过/);
  assert.throws(() => expand(root(condition("unknown", "a"))), /字段/);
});
