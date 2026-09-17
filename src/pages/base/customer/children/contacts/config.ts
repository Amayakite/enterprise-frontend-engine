import { defineFields } from "@/components/business/fields/normalize";
import type { CustomerContact } from "@/api/base/customer/types";
import { defineCustomerChildConfig } from "../types";

const fields = defineFields<CustomerContact>()([
  {
    key: "name",
    label: "姓名",
    type: "text",
    form: { required: true },
    table: { minWidth: 110 },
    props: { maxlength: 30 },
  },
  {
    key: "position",
    label: "职务 / 部门",
    type: "text",
    form: {},
    table: { minWidth: 130 },
    props: { maxlength: 40 },
  },
  {
    key: "phone",
    label: "联系电话",
    type: "text",
    form: { required: true },
    table: { minWidth: 155 },
    props: { maxlength: 30 },
  },
  {
    key: "email",
    label: "邮箱",
    type: "text",
    formatHint: "email",
    form: { rules: { type: "email", message: "请输入正确的邮箱地址" } },
    table: { minWidth: 195 },
    props: { maxlength: 100 },
  },
  {
    key: "primary",
    label: "主要联系人",
    type: "switch",
    form: false,
    table: { width: 100, slot: "column-primary" },
  },
]);

function normalizeRows(rows: readonly CustomerContact[], preferredId?: string) {
  if (!rows.length) return [];
  const selected = preferredId ?? rows.find((row) => row.primary)?.id ?? rows[0]!.id;
  return rows.map((row) => ({ ...row, primary: row.id === selected }));
}

export const customerContactsConfig = defineCustomerChildConfig({
  key: "contacts",
  /** 保留主要项操作与行编辑体验，按需加载。 */
  view: { component: () => import("./CustomerContacts.vue") },
  title: "联系人",
  draft: { version: 1, fields: ["id", "name", "position", "phone", "email", "primary"] },
  fields,
  getRowKey: (row: Readonly<CustomerContact>) => row.id,
  createInitialRow: (rows: readonly CustomerContact[]) => ({
    id: crypto.randomUUID(),
    name: "",
    position: "",
    phone: "",
    email: "",
    primary: rows.length === 0,
  }),
  editPresentation: "inline",
  normalizeRows: (rows) => normalizeRows(rows),
  validateRows: (rows) => {
    const issues: string[] = [];
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      issues.push("子表存在重复行键，请重新载入");
    if (rows.length && rows.filter((row) => row.primary).length !== 1)
      issues.push("联系人需保留一个主要联系人");
    return issues;
  },
  actions: { setPrimary: (rows, id) => normalizeRows(rows, id) },
  persistence: {
    mode: "aggregate",
    toPayload: (rows) =>
      rows.map(({ id, name, position, phone, email, primary }) => ({
        id,
        name: name.trim(),
        position: position.trim(),
        phone: phone.trim(),
        email: email.trim(),
        primary,
      })),
  },
});
