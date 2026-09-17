import { defineFields } from "@/components/business/fields/normalize";
import type { CustomerAddress } from "@/api/base/customer/types";
import { defineCustomerChildConfig } from "../types";

const fields = defineFields<CustomerAddress>()([
  {
    key: "label",
    label: "地址名称",
    type: "text",
    form: { required: true },
    table: { minWidth: 115 },
    props: { maxlength: 30 },
  },
  {
    key: "recipient",
    label: "收货人",
    type: "text",
    form: { required: true },
    table: { minWidth: 110 },
    props: { maxlength: 30 },
  },
  {
    key: "phone",
    label: "联系电话",
    type: "text",
    form: { required: true },
    table: { minWidth: 145 },
    props: { maxlength: 30 },
  },
  {
    key: "address",
    label: "收货地址",
    type: "textarea",
    form: { required: true },
    table: { minWidth: 300 },
    props: { maxlength: 200, rows: 2 },
  },
  {
    key: "primary",
    label: "默认地址",
    type: "switch",
    form: false,
    table: { width: 95, slot: "column-primary" },
  },
]);

function normalizeRows(rows: readonly CustomerAddress[], preferredId?: string) {
  if (!rows.length) return [];
  const selected = preferredId ?? rows.find((row) => row.primary)?.id ?? rows[0]!.id;
  return rows.map((row) => ({ ...row, primary: row.id === selected }));
}

export const customerAddressesConfig = defineCustomerChildConfig({
  key: "addresses",
  /** 保留主要项操作与行编辑体验，按需加载。 */
  view: { component: () => import("./CustomerAddresses.vue") },
  title: "收货地址",
  draft: { version: 1, fields: ["id", "label", "recipient", "phone", "address", "primary"] },
  fields,
  getRowKey: (row: Readonly<CustomerAddress>) => row.id,
  createInitialRow: (rows: readonly CustomerAddress[]) => ({
    id: crypto.randomUUID(),
    label: "",
    recipient: "",
    phone: "",
    address: "",
    primary: rows.length === 0,
  }),
  editPresentation: "drawer",
  editDrawer: {
    title: (row) => (row.label ? `编辑收货地址 · ${row.label}` : "新增收货地址"),
    width: "min(720px, 92vw)",
    columns: 2,
  },
  normalizeRows: (rows) => normalizeRows(rows),
  validateRows: (rows) => {
    const issues: string[] = [];
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      issues.push("子表存在重复行键，请重新载入");
    if (rows.length && rows.filter((row) => row.primary).length !== 1)
      issues.push("地址需保留一个默认地址");
    return issues;
  },
  actions: { setPrimary: (rows, id) => normalizeRows(rows, id) },
  persistence: {
    mode: "aggregate",
    toPayload: (rows) =>
      rows.map(({ id, label, recipient, phone, address, primary }) => ({
        id,
        label: label.trim(),
        recipient: recipient.trim(),
        phone: phone.trim(),
        address: address.trim(),
        primary,
      })),
  },
});
