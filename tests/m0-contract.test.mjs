import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Node 原生去类型运行源码；仅为项目现有无扩展名的相对 TS 引用补后缀，不引入测试依赖。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { createAccessScopeKey, serializeStableKey } = await import("../src/utils/identity.ts");
const { normalizeSearchText } = await import("../src/utils/string.ts");
const { customers, contacts, products, searchLab, resolveLab, readLabControls } =
  await import("../mock/reference-data.ts");
const filters = { organizationId: "org-a" };
const query = (overrides = {}) => ({
  keyword: "",
  filters,
  conditions: [],
  pageNum: 1,
  pageSize: 10,
  purpose: "dialog",
  ...overrides,
});

test("稳定键保留 0 与 ID 类型，拒绝歧义空值和不安全数值", () => {
  assert.equal(serializeStableKey(0), "n:0");
  assert.notEqual(serializeStableKey(1), serializeStableKey("1"));
  assert.notEqual(serializeStableKey(" 1"), serializeStableKey("1"));
  for (const value of [null, undefined, "", " ", NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => serializeStableKey(value));
});
test("S4 访问范围键短小、稳定并区分权限集合", () => {
  const permissions = Array.from({ length: 200 }, (_, index) => `module:action:${index}`);
  const first = createAccessScopeKey("customer", "org-a", 2, permissions);
  const reordered = createAccessScopeKey("customer", "org-a", 2, [...permissions].reverse());
  assert.equal(first, reordered);
  assert.ok(first.length < 100);
  assert.notEqual(first, createAccessScopeKey("customer", "org-a", "2", permissions));
  assert.notEqual(first, createAccessScopeKey("customer", "org-a", 2, [...permissions, "extra"]));
  assert.throws(() => createAccessScopeKey(" ", "org-a", 2, permissions));
});
test("搜索规范化明确空值/空白/大小写边界，不执行 Unicode 归一化", () => {
  assert.equal(normalizeSearchText(null), "");
  assert.equal(normalizeSearchText(undefined), "");
  assert.equal(normalizeSearchText("  AbC 客户  "), "abc 客户");
  assert.equal(normalizeSearchText("a  b"), "a  b");
  assert.notEqual(normalizeSearchText("é"), normalizeSearchText("e\u0301"));
});
test("确定数据规模与分页保持组织范围，分页没有交集", () => {
  assert.deepEqual([customers.length, contacts.length, products.length], [200, 100, 500]);
  const first = searchLab("customers", query());
  const second = searchLab("customers", query({ pageNum: 2 }));
  assert.equal(first.total, 100);
  assert.equal(first.list[0].id, 0);
  assert(first.list.every((row) => row.organizationId === "org-a"));
  assert(second.list.every((row) => !first.list.some((old) => old.id === row.id)));
  assert.equal(searchLab("products", query()).total, 250);
});
test("范围与用户筛选取交集，拒绝覆盖组织和未声明排序/操作符", () => {
  assert(searchLab("customers", query({ keyword: " c0000 " })).list.some((row) => row.id === 0));
  assert.equal(
    searchLab("customers", query({ conditions: [{ key: "active", operator: "eq", value: false }] }))
      .list[0].active,
    false
  );
  assert.throws(() =>
    searchLab(
      "customers",
      query({ conditions: [{ key: "organizationId", operator: "eq", value: "org-b" }] })
    )
  );
  assert.throws(() =>
    searchLab("customers", query({ sort: { key: "organizationId", order: "asc" } }))
  );
  assert.throws(() => searchLab("customers", query({ pageSize: 101 })));
  assert.throws(() => searchLab("customers", query({ filters: {} })));
});
test("客户 0 可作联系人范围，null 与跨组织客户不放开查询", () => {
  assert.equal(searchLab("contacts", query({ filters: { ...filters, customerId: 0 } })).total, 10);
  assert.equal(
    searchLab("contacts", query({ filters: { ...filters, customerId: null } })).total,
    0
  );
  assert.equal(searchLab("contacts", query({ filters: { ...filters, customerId: 1 } })).total, 0);
  assert.throws(() => searchLab("contacts", query({ filters: { ...filters, customerId: "0" } })));
});
test("批量回显覆盖当前页外的 ID，停用/缺失/越界归不可用且保序", () => {
  const result = resolveLab("customers", [198, 0, 16, 9999, 1], filters);
  assert.deepEqual(
    result.items.map((row) => row.id),
    [198, 0]
  );
  assert.deepEqual(result.unavailableIds, [16, 9999, 1]);
  assert.equal(result.items.length + result.unavailableIds.length, 5);
  assert.throws(() => resolveLab("customers", [0, 0], filters));
  assert.throws(() => resolveLab("customers", ["0"], filters));
  assert.throws(() => resolveLab("products", [0], filters));
  assert.equal(resolveLab("products", ["0"], filters).items[0].id, "0");
});
test("空结果与延迟失败开关可确定复现，不将缺失记录当系统异常", () => {
  assert.deepEqual(searchLab("customers", query(), true), { list: [], total: 0 });
  assert.deepEqual(resolveLab("customers", [0], filters, true), { items: [], unavailableIds: [0] });
  for (const delayMs of [50, 300, 1500])
    assert.deepEqual(readLabControls({ delayMs, fail: true }), {
      delayMs,
      fail: true,
      empty: false,
    });
  assert.throws(() => readLabControls({ delayMs: -1 }));
  assert.throws(() => readLabControls({ fail: "true" }));
});
test("白名单价格排序保留数字 0，并支持非第一页", () => {
  const ascending = searchLab("products", query({ sort: { key: "price", order: "asc" } }));
  const descending = searchLab("products", query({ sort: { key: "price", order: "desc" } }));
  assert.equal(ascending.list[0].price, 0);
  assert.equal(descending.list[0].price, 4980);
});
