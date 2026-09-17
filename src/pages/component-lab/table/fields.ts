import { defineFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import { customerSource, productSource } from "@/pages/component-lab/reference/references";
import type { FieldLink } from "@/components/business/fields/types";
import type { OrderHeader, OrderLine, OrderContext } from "./types";
import { lineAmount } from "./adapters";

export const headerFields = defineFields<OrderHeader, OrderContext>()([
  { key: "title", label: "单据标题", type: "text", form: { required: true } },
  {
    key: "customerId",
    label: "客户",
    type: "reference",
    form: { required: true },
    reference: createReferenceField<OrderHeader, OrderContext>()({
      source: customerSource,
      filters: ({ context }) => context,
      scopeKey: ({ context }) => context.organizationId,
    }),
  },
]);
export const lineFields = defineFields<OrderLine, OrderContext>()([
  {
    key: "productId",
    label: "商品",
    type: "reference",
    table: { minWidth: 260 },
    form: { required: true },
    reference: createReferenceField<OrderLine, OrderContext>()({
      source: productSource,
      filters: ({ context }) => context,
      scopeKey: ({ context }) => context.organizationId,
      map: (commit) => ({ price: commit.items[0]?.price ?? 0 }),
    }),
  },
  {
    key: "quantity",
    label: "数量",
    type: "number",
    table: { width: 160, sortable: true },
    form: { required: true, rules: { type: "number", min: 0.01, message: "数量必须大于 0" } },
    props: { min: 0, precision: 2 },
  },
  {
    key: "price",
    label: "单价",
    type: "number",
    table: { width: 180, sortable: true },
    form: { required: true, rules: { type: "number", min: 0, message: "单价不得小于 0" } },
    props: { min: 0, precision: 2 },
  },
  {
    key: "amount",
    label: "金额",
    type: "number",
    table: { width: 140, format: (value) => value.toFixed(2) },
    form: { readonly: true },
  },
  {
    key: "note",
    label: "备注",
    type: "text",
    table: { minWidth: 200 },
    form: {},
    props: { maxlength: 100 },
  },
]);
export const lineLinks: readonly FieldLink<OrderLine, OrderContext>[] = [
  {
    watch: ["quantity", "price"],
    writes: ["amount"],
    apply: ({ model }) => ({ amount: lineAmount(model.quantity, model.price) }),
  },
];
