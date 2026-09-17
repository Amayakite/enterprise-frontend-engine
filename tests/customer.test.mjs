import { test } from "node:test";
import assert from "node:assert/strict";
import "./reference-harness.mjs";

const { toCustomerForm, toCustomerPayload } =
  await import("../src/pages/base/customer/adapters.ts");
const { customerContactsConfig } =
  await import("../src/pages/base/customer/children/contacts/config.ts");
const { customerAddressesConfig } =
  await import("../src/pages/base/customer/children/addresses/config.ts");
const { defineAggregateBinding } = await import("../src/components/business/crud/aggregate.ts");
const bind = defineAggregateBinding();
const children = {
  contacts: bind({ modelKey: "contacts", payloadKey: "contacts", config: customerContactsConfig }),
  addresses: bind({
    modelKey: "addresses",
    payloadKey: "addresses",
    config: customerAddressesConfig,
  }),
};
const { createCustomerSeeds, validateCustomerPayload, materializeCustomer } =
  await import("../mock/customer-data.ts");

test("客户 DTO 隔离展示、状态和版本字段，主子表修改不污染载入快照", () => {
  const record = createCustomerSeeds()[0];
  const form = toCustomerForm(record);
  form.customerName = " 新客户 ";
  form.contacts[0].name = " 新联系人 ";
  form.status = "approved";
  const payload = toCustomerPayload(form, children);
  assert.equal(payload.customerName, "新客户");
  assert.equal(payload.saleId, "sale-east");
  assert.equal(payload.contacts[0].name, "新联系人");
  assert.notEqual(record.contacts[0].name, " 新联系人 ");
  assert.deepEqual(Object.keys(payload).sort(), [
    "address",
    "addresses",
    "cityId",
    "contacts",
    "creditCode",
    "customerName",
    "customerType",
    "districtId",
    "phone",
    "provinceId",
    "remark",
    "saleId",
    "shortName",
  ]);
  for (const key of ["id", "saleName", "status", "version", "customerCode", "provinceName"])
    assert.equal(Object.hasOwn(payload, key), false);
  const saved = materializeCustomer(
    { ...payload, status: "approved", active: false },
    "new",
    "KH999999"
  );
  assert.equal(saved.status, "pending");
  assert.equal(saved.active, true);
  payload.contacts[0].name = "再次修改";
  assert.equal(saved.contacts[0].name, "新联系人");
});

test("客户校验拒绝跨省市区、重复行键和多个默认项", () => {
  const payload = toCustomerPayload(toCustomerForm(createCustomerSeeds()[0]), children);
  assert.equal(validateCustomerPayload(payload), undefined);
  assert.match(validateCustomerPayload({ ...payload, cityId: "320100" }), /不匹配/);
  assert.match(
    validateCustomerPayload({ ...payload, contacts: [payload.contacts[0], payload.contacts[0]] }),
    /重复行键/
  );
  assert.match(
    validateCustomerPayload({
      ...payload,
      contacts: payload.contacts.map((row) => ({ ...row, primary: true })),
    }),
    /仅保留一个/
  );
});

test("客户保存必须关联已启用 Sale，页面白名单不传展示字段", () => {
  const form = toCustomerForm(createCustomerSeeds()[0]);
  form.saleId = null;
  assert.throws(() => toCustomerPayload(form, children), /请选择销售组织/);

  const payload = toCustomerPayload(toCustomerForm(createCustomerSeeds()[0]), children);
  assert.match(validateCustomerPayload({ ...payload, saleId: "sale-old" }), /有效的销售组织/);
  assert.match(validateCustomerPayload({ ...payload, saleId: "unknown" }), /有效的销售组织/);
});

test("客户默认项归一化支持首行、切换和删除默认项后的补位", () => {
  const rows = [
    { id: "a", primary: false, value: 1 },
    { id: "b", primary: false, value: 2 },
  ];
  assert.deepEqual(
    customerContactsConfig.normalizeRows(rows).map((row) => row.primary),
    [true, false]
  );
  assert.deepEqual(
    customerContactsConfig.actions.setPrimary(rows, "b").map((row) => row.primary),
    [false, true]
  );
  const afterRemove = customerContactsConfig.normalizeRows([
    { id: "b", name: "B", position: "", phone: "1", email: "", primary: false },
  ]);
  assert.equal(afterRemove[0].primary, true);
  assert.deepEqual(
    rows.map((row) => row.primary),
    [false, false]
  );
});
