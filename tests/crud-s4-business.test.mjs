import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
const menu = (await import("../mock/menu.mock.ts")).default;
const endpoint = (items, url, method) => {
  const match = items.find((item) => item.url === url && item.method.includes(method));
  assert.ok(match, `${method} ${url} 不存在`);
  return match;
};
const body = (where = null) => ({
  scope: { key: "s4:org-a", value: { organizationId: "org-a" } },
  where,
  sort: null,
  pageNum: 1,
  pageSize: 20,
});

test("S4 客户真实 Mock 完成信用代码查询、整单保存、版本动作与清理", async () => {
  const payload = {
    saleId: "sale-east",
    customerName: " S4 迁移验收客户 ",
    shortName: "S4客户",
    customerType: "distributor",
    creditCode: "91310000S400000001",
    phone: "021-60000001",
    provinceId: "310000",
    cityId: "310100",
    districtId: "310115",
    address: "张江路 100 号",
    remark: "S4 整单验收",
    contacts: [
      {
        id: "s4-contact",
        name: "验收人",
        position: "采购",
        phone: "13800000001",
        email: "s4@example.com",
        primary: true,
      },
    ],
    addresses: [
      {
        id: "s4-address",
        label: "主仓",
        recipient: "验收人",
        phone: "13800000001",
        address: "上海市浦东新区张江路 100 号",
        primary: true,
      },
    ],
  };
  const created = await endpoint(customer, "pilot/customers", "POST").body({ body: payload });
  assert.equal(created.code, "00000");
  const id = created.data.id;
  assert.equal(created.data.contacts[0].name, "验收人");
  const search = await endpoint(customer, "pilot/customers/search", "POST").body({
    body: body({
      kind: "group",
      id: "root",
      operator: "and",
      children: [
        {
          kind: "condition",
          id: "credit",
          field: "creditCode",
          operator: "eq",
          value: payload.creditCode,
        },
      ],
    }),
  });
  assert.equal(search.data.total, 1);
  assert.equal(search.data.list[0].id, id);
  const stale = await endpoint(customer, "pilot/customers/:id", "PUT").body({
    params: { id },
    body: { ...payload, version: 99 },
  });
  assert.notEqual(stale.code, "00000");
  const updated = await endpoint(customer, "pilot/customers/:id", "PUT").body({
    params: { id },
    body: { ...payload, remark: "已编辑", version: created.data.version },
  });
  assert.equal(updated.code, "00000");
  const approved = await endpoint(customer, "pilot/customers/:id/actions", "POST").body({
    params: { id },
    body: { action: "approve", version: updated.data.version },
  });
  assert.equal(approved.data.status, "approved");
  const blocked = await endpoint(customer, "pilot/customers/:id", "DELETE").body({
    params: { id },
    body: { version: approved.data.version },
  });
  assert.notEqual(blocked.code, "00000");
  const revoked = await endpoint(customer, "pilot/customers/:id/actions", "POST").body({
    params: { id },
    body: { action: "revoke", version: approved.data.version },
  });
  const removed = await endpoint(customer, "pilot/customers/:id", "DELETE").body({
    params: { id },
    body: { version: revoked.data.version },
  });
  assert.equal(removed.code, "00000");
});

test("S4 任务费用真实 Mock 完成金额、回执再读、批量状态与删除闭环", async () => {
  const payload = {
    billDate: "2026-09-10",
    principalPartyId: "party-a-1",
    providerPartyId: "party-b-1",
    inventoryId: "inv-1",
    amount: "1234.50",
    attachments: [{ name: "S4.txt", url: "/pilot-files/s4.txt" }],
    remark: "S4 迁移验收",
  };
  const created = await endpoint(fee, "pilot/task-fees", "POST").body({ body: payload });
  assert.equal(created.code, "00000");
  assert.deepEqual(Object.keys(created.data).sort(), ["billCode", "id", "version"]);
  const id = created.data.id;
  const loaded = await endpoint(fee, "pilot/task-fees/:id", "GET").body({ params: { id } });
  assert.equal(loaded.data.amount, "1234.50");
  assert.equal(loaded.data.attachments[0].name, "S4.txt");
  const stale = await endpoint(fee, "pilot/task-fees/:id", "PUT").body({
    params: { id },
    body: { ...payload, amount: "2000.00", version: 0 },
  });
  assert.notEqual(stale.code, "00000");
  const updated = await endpoint(fee, "pilot/task-fees/:id", "PUT").body({
    params: { id },
    body: { ...payload, amount: "2000.00", version: created.data.version },
  });
  assert.equal(updated.code, "00000");
  const approved = await endpoint(fee, "pilot/task-fees/approve", "POST").body({
    body: { ids: [id] },
  });
  assert.deepEqual(approved.data.affectedIds, [id]);
  const approvedDetail = await endpoint(fee, "pilot/task-fees/:id", "GET").body({ params: { id } });
  assert.equal(approvedDetail.data.status, "approved");
  assert.equal(approvedDetail.data.generatedTaskCodes.length, 1);
  await endpoint(fee, "pilot/task-fees/revoke", "POST").body({ body: { ids: [id] } });
  const removed = await endpoint(fee, "pilot/task-fees/remove", "POST").body({
    body: { ids: [id] },
  });
  assert.deepEqual(removed.data.affectedIds, [id]);
});

test("S4 菜单深链与两模块装配入口完整，旧弹窗和客户公共流程已清理", () => {
  const routes = endpoint(menu, "menus/routes", "GET").body.data.flatMap((group) => group.children);
  const expected = new Map([
    ["CustomerAdd", "base/customer/add"],
    ["CustomerEdit", "base/customer/edit"],
    ["CustomerDetail", "base/customer/detail"],
    ["TaskFeeAdd", "task/fee/add"],
    ["TaskFeeEdit", "task/fee/edit"],
    ["TaskFeeDetail", "task/fee/detail"],
  ]);
  for (const [name, component] of expected) {
    const route = routes.find((item) => item.name === name);
    assert.ok(route, `${name} 路由不存在`);
    assert.equal(route.component, component);
    assert.equal(route.meta.hidden, true);
  }
  for (const file of ["src/pages/base/customer/index.vue", "src/pages/task/fee/index.vue"])
    assert.match(fs.readFileSync(file, "utf8"), /MyCrudList/);
  for (const file of [
    "src/pages/base/customer/add.vue",
    "src/pages/base/customer/edit.vue",
    "src/pages/task/fee/FeeEditor.vue",
  ])
    assert.match(fs.readFileSync(file, "utf8"), /MyCrudForm/);
  for (const file of ["src/pages/base/customer/detail.vue", "src/pages/task/fee/detail.vue"])
    assert.match(fs.readFileSync(file, "utf8"), /MyCrudDetail/);
  for (const file of [
    "src/pages/base/customer/useCustomerRecord.ts",
    "src/pages/base/customer/useCustomerActions.ts",
    "src/pages/base/customer/detail/useCustomerChildRows.ts",
    "src/pages/base/customer/customer.scss",
    "src/pages/task/fee/components/FeeEditorDialog.vue",
    "src/pages/task/fee/components/FeeDetailDialog.vue",
  ])
    assert.equal(fs.existsSync(file), false, `${file} 应已删除`);
});
