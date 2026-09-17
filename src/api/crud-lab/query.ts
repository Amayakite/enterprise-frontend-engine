import type { QuerySchema } from "@/components/business/search/types";
export const crudLabSchema = {
  id: { label: "ID", kind: "number", entries: ["normal"], operators: ["eq"] },
  code: {
    label: "编号",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: ["contains", "eq"],
  },
  title: {
    label: "名称",
    kind: "text",
    entries: ["quick", "normal", "advanced"],
    operators: ["contains", "eq"],
  },
  billDate: {
    label: "业务日期",
    kind: "date",
    entries: ["normal", "advanced"],
    operators: ["between", "eq"],
  },
  amount: {
    label: "金额",
    kind: "decimal",
    entries: ["advanced"],
    operators: ["gte", "lte", "between"],
  },
  category: {
    label: "类型",
    kind: "enum",
    entries: ["quick", "advanced"],
    operators: ["eq", "in"],
    options: [
      { label: "常规", value: "regular" },
      { label: "加急", value: "urgent" },
    ],
  },
  status: {
    label: "状态",
    kind: "enum",
    entries: ["normal", "advanced"],
    operators: ["eq", "in"],
    options: [
      { label: "草稿", value: "draft" },
      { label: "已确认", value: "confirmed" },
    ],
  },
} as const satisfies QuerySchema;
