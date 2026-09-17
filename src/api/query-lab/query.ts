import type { QuerySchema } from "@/components/business/search/types";
export const queryLabSchema = {
  name: {
    label: "名称",
    kind: "text",
    entries: ["quick", "normal", "advanced"],
    operators: [
      "contains",
      "eq",
      "ne",
      "notContains",
      "startsWith",
      "endsWith",
      "isEmpty",
      "isNotEmpty",
    ],
  },
  id: {
    label: "记录 ID",
    kind: "number",
    entries: ["normal", "advanced"],
    operators: ["eq", "gte", "lte", "between"],
  },
  gender: {
    label: "性别字典",
    kind: "enum",
    entries: ["quick", "normal", "advanced"],
    operators: ["eq", "in", "notIn"],
    dictionary: { code: "gender", valueType: "string" },
    options: [
      { label: "未知", value: "0" },
      { label: "男", value: "1" },
      { label: "女", value: "2" },
    ],
  },
  active: {
    label: "启用",
    kind: "boolean",
    entries: ["normal", "advanced"],
    operators: ["eq", "ne"],
  },
  billDate: {
    label: "日期",
    kind: "date",
    entries: ["normal", "advanced"],
    operators: ["between", "eq", "gt", "gte", "lt", "lte"],
  },
  amount: {
    label: "金额",
    kind: "decimal",
    entries: ["normal", "advanced"],
    operators: ["between", "eq", "gte", "lte"],
  },
  customerId: {
    label: "关联客户",
    kind: "reference",
    valueType: "number",
    entries: ["normal", "advanced"],
    operators: ["eq", "in", "notIn"],
  },
  email: {
    label: "邮箱",
    kind: "text",
    entries: ["advanced"],
    operators: ["contains", "eq", "isEmpty", "isNotEmpty"],
  },
} as const satisfies QuerySchema;
