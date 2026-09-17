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
  resolve(specifier, context, next) {
    if (specifier === "async-validator") return next("async-validator/dist-web/index.js", context);
    if (specifier === "@/api/base/sale")
      return { url: "data:text/javascript,export default {};", shortCircuit: true };
    return next(specifier, context);
  },
});

const sale = (await import("../mock/sale.mock.ts")).default;
const { saleRows } = await import("../mock/sale-data.ts");
const { saleReference } = await import("../src/pages/base/sale/references.ts");

function endpoint(url, method) {
  const result = sale.find((item) => item.url === url && item.method.includes(method));
  assert.ok(result, `${method} ${url} 不存在`);
  return result;
}

function query(where = null, organizationId = "org-a") {
  return {
    scope: { key: `sale:${organizationId}`, value: { organizationId } },
    where,
    sort: null,
    pageNum: 1,
    pageSize: 20,
  };
}

const condition = (field, operator, value, id = field) => ({
  kind: "condition",
  id,
  field,
  operator,
  value,
});

test("Sale 真实 Mock 先收紧组织范围，再执行合法 AST", async () => {
  const search = endpoint("pilot/sales/search", "POST");
  const foreign = {
    id: "sale-test-foreign",
    code: "SALE-FOREIGN",
    name: "外部销售组织",
    active: true,
    remark: "仅用于范围回归",
    organizationId: "org-b",
    version: 0,
  };
  saleRows.push(foreign);
  try {
    const where = {
      kind: "group",
      id: "root",
      operator: "or",
      children: [
        condition("code", "eq", "SALE-HD", "east"),
        condition("code", "eq", foreign.code, "foreign"),
      ],
    };
    const scoped = await search.body({ body: query(where) });
    assert.equal(scoped.code, "00000");
    assert.deepEqual(
      scoped.data.list.map((row) => row.id),
      ["sale-east"]
    );

    const range = await search.body({
      body: query({
        kind: "group",
        id: "range-root",
        operator: "and",
        children: [condition("name", "contains", "销售组织", "name")],
      }),
    });
    assert.equal(range.data.total, 3);
    assert.ok(range.data.list.every((row) => row.organizationId === "org-a"));

    const invalid = await search.body({
      body: query({
        kind: "group",
        id: "invalid-root",
        operator: "and",
        children: [condition("organizationId", "eq", "org-b")],
      }),
    });
    assert.notEqual(invalid.code, "00000");
  } finally {
    saleRows.splice(saleRows.indexOf(foreign), 1);
  }
});

test("Sale 停用记录可 resolve 回显但不可作为客户新选择", async () => {
  const resolve = endpoint("pilot/sales/resolve", "POST");
  const result = await resolve.body({
    body: { ids: ["sale-east", "sale-old", "not-found"], filters: { organizationId: "org-a" } },
  });
  assert.equal(result.code, "00000");
  assert.deepEqual(
    result.data.items.map((row) => row.id),
    ["sale-east", "sale-old"]
  );
  assert.deepEqual(result.data.unavailableIds, ["not-found"]);
  assert.deepEqual(saleReference.selectable(result.data.items[0]), {
    allowed: true,
    reason: undefined,
  });
  assert.deepEqual(saleReference.selectable(result.data.items[1]), {
    allowed: false,
    reason: "销售组织已停用",
  });
});

test("Sale 创建和更新只接收白名单，并拒绝重复编码与过期版本", async () => {
  const create = endpoint("pilot/sales", "POST");
  const update = endpoint("pilot/sales/:id", "PUT");
  const payload = { code: "SALE-TEST", name: "销售测试组织", active: true, remark: "回归测试" };
  const duplicate = await create.body({ body: { ...payload, code: "SALE-HD" } });
  assert.notEqual(duplicate.code, "00000");

  const created = await create.body({
    body: { ...payload, id: "client-id", organizationId: "org-b", version: 99 },
  });
  assert.equal(created.code, "00000");
  assert.deepEqual(Object.keys(created.data).sort(), [
    "active",
    "code",
    "id",
    "name",
    "organizationId",
    "remark",
    "version",
  ]);
  assert.equal(created.data.organizationId, "org-a");
  assert.equal(created.data.version, 0);

  try {
    const stale = await update.body({
      params: { id: created.data.id },
      body: { ...payload, name: "过期写入", version: 9 },
    });
    assert.notEqual(stale.code, "00000");

    const duplicateUpdate = await update.body({
      params: { id: created.data.id },
      body: { ...payload, code: "SALE-HN", version: created.data.version },
    });
    assert.notEqual(duplicateUpdate.code, "00000");

    const updated = await update.body({
      params: { id: created.data.id },
      body: { ...payload, name: "已更新销售测试组织", version: created.data.version },
    });
    assert.equal(updated.code, "00000");
    assert.equal(updated.data.version, 1);
    assert.equal(updated.data.name, "已更新销售测试组织");
  } finally {
    const index = saleRows.findIndex((row) => row.id === created.data.id);
    if (index >= 0) saleRows.splice(index, 1);
  }
});
