import type { QuerySchema } from "../src/components/business/search/types";
import { FIELD_QUERY_OPERATORS } from "../src/components/business/crud/field-query";

/** 开发 Mock 模拟服务端字段与枚举白名单；不供页面生成查询 UI。真实后端须独立校验。 */
export const customerQuerySchema = {
  keyword: {
    label: "客户关键字",
    kind: "text",
    entries: ["quick"],
    operators: FIELD_QUERY_OPERATORS.text,
    placeholder: "名称、编码、信用代码、简称或电话",
  },
  customerCode: {
    label: "客户编码",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  customerName: {
    label: "客户名称",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  shortName: {
    label: "简称",
    kind: "text",
    entries: ["advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  creditCode: {
    label: "统一社会信用代码",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  phone: {
    label: "电话",
    kind: "text",
    entries: ["advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  customerType: {
    label: "客户类型",
    kind: "enum",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.enum,
    options: [
      { label: "医药商业", value: "distributor" },
      { label: "连锁药店", value: "chain" },
      { label: "医疗机构", value: "hospital" },
    ],
  },
  status: {
    label: "审核状态",
    kind: "enum",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.enum,
    options: [
      { label: "待审核", value: "pending" },
      { label: "已审核", value: "approved" },
    ],
  },
  active: {
    label: "启用状态",
    kind: "boolean",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.boolean,
  },
  provinceId: {
    label: "省份",
    kind: "reference",
    valueType: "string",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.reference,
  },
  cityId: {
    label: "城市",
    kind: "reference",
    valueType: "string",
    entries: ["advanced"],
    operators: FIELD_QUERY_OPERATORS.reference,
  },
  districtId: {
    label: "区县",
    kind: "reference",
    valueType: "string",
    entries: ["advanced"],
    operators: FIELD_QUERY_OPERATORS.reference,
  },
  createdTime: {
    label: "创建时间",
    kind: "datetime",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.datetime,
  },
} as const satisfies QuerySchema;
