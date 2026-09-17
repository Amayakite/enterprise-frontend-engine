import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import "./reference-harness.mjs";

const read = (file) => fs.readFileSync(file, "utf8");
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });

const { customerContactsConfig } =
  await import("../src/pages/base/customer/children/contacts/config.ts");
const { customerAddressesConfig } =
  await import("../src/pages/base/customer/children/addresses/config.ts");
const { defineCustomerChildConfig } = await import("../src/pages/base/customer/children/types.ts");

test("U3 客户复杂子模块各自拥有完整 aggregate 配置并由父入口汇总", () => {
  for (const module of [customerContactsConfig, customerAddressesConfig]) {
    assert.equal(module.persistence.mode, "aggregate");
    assert.ok(module.key && module.title && module.fields.length);
    for (const fn of [
      module.getRowKey,
      module.createInitialRow,
      module.normalizeRows,
      module.validateRows,
      module.actions.setPrimary,
      module.persistence.toPayload,
    ])
      assert.equal(typeof fn, "function");
  }
  assert.equal(customerContactsConfig.editPresentation, "inline");
  assert.equal(customerAddressesConfig.editPresentation, "drawer");
  assert.ok(customerAddressesConfig.editDrawer);

  const parent = read("src/pages/base/customer/config.ts");
  assert.match(parent, /customerContactsConfig/);
  assert.match(parent, /customerAddressesConfig/);
  assert.doesNotMatch(parent, /contactFields|addressFields/);
  assert.match(parent, /fields:\s*\[/);
  assert.match(parent, /children:\s*\{/);
  assert.equal(fs.existsSync("src/pages/base/customer/detail/CustomerContacts.vue"), false);
  assert.equal(fs.existsSync("src/pages/base/customer/detail/CustomerAddresses.vue"), false);
});

test("U3 子模块默认项、诊断和 DTO 白名单由配置所有者执行", () => {
  const rows = [
    {
      id: "a",
      name: " A ",
      position: " P ",
      phone: " 1 ",
      email: " a@example.com ",
      primary: false,
    },
    { id: "b", name: "B", position: "", phone: "2", email: "", primary: false },
  ];
  const normalized = customerContactsConfig.normalizeRows(rows);
  assert.deepEqual(
    normalized.map((row) => row.primary),
    [true, false]
  );
  assert.deepEqual(
    customerContactsConfig.actions.setPrimary(rows, "b").map((row) => row.primary),
    [false, true]
  );
  assert.equal(
    customerContactsConfig.validateRows([
      { ...rows[0], primary: true },
      { ...rows[0], primary: true },
    ]).length,
    2
  );
  assert.deepEqual(customerContactsConfig.persistence.toPayload(normalized)[0], {
    id: "a",
    name: "A",
    position: "P",
    phone: "1",
    email: "a@example.com",
    primary: true,
  });
  assert.throws(
    () =>
      defineCustomerChildConfig({
        ...customerContactsConfig,
        persistence: { ...customerContactsConfig.persistence, mode: "independent" },
      }),
    /当前仅支持 aggregate/
  );
});

test("U3 生产普通弹窗已迁移 MyDialog，仅保留有记录的特殊命令浮层", () => {
  const vueFiles = walk("src").filter((file) => file.endsWith(".vue"));
  const directDialogs = vueFiles
    .filter((file) => /<el-dialog\b/.test(read(file)))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(directDialogs, [
    "src/components/common/MyDialog.vue",
    "src/pages/component-lab/reference/SingleReferenceDemo.vue",
    "src/pages/component-lab/reference/index.vue",
    "src/pages/layout/components/CommandPalette/index.vue",
  ]);
  for (const file of [
    "src/pages/service/application/components/ApplicationEditorDialog.vue",
    "src/pages/service/application/components/ApplicationDetailDialog.vue",
    "src/pages/system/user/index.vue",
    "src/pages/system/user/components/UserImportDialog.vue",
    "src/pages/system/role/index.vue",
    "src/pages/system/notice/index.vue",
    "src/pages/system/log/index.vue",
    "src/pages/system/dict/index.vue",
    "src/pages/system/dict/dict-item.vue",
    "src/pages/system/config/index.vue",
    "src/pages/system/dept/index.vue",
    "src/pages/profile/index.vue",
    "src/pages/profile/notice/index.vue",
    "src/pages/layout/components/NoticeDropdown/index.vue",
  ])
    assert.match(read(file), /<MyDialog\b/, `${file} 未使用 MyDialog`);
});

test("U3 客户 API 仍是整单写入合同，没有伪造独立子表端点", () => {
  const api = read("src/api/base/customer/index.ts");
  assert.match(api, /data: CustomerSavePayload/);
  assert.doesNotMatch(api, /contacts\/|addresses\//);
  assert.match(read("mock/customer.mock.ts"), /validateCustomerPayload\(body\)/);
});
