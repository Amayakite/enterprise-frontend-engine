import { defineFields, buildSearchFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldLink } from "@/components/business/fields/types";
import { customerSource, contactSource } from "@/pages/component-lab/reference/references";
import type { FormLabModel, FormLabContext, FormLabQuery } from "./types";

const reference = createReferenceField<FormLabModel, FormLabContext>();
export const fields = defineFields<FormLabModel, FormLabContext>()([
  {
    key: "customerId",
    label: "客户",
    type: "reference",
    form: { required: true, group: "往来信息" },
    detail: { group: "往来信息" },
    reference: reference({
      source: customerSource,
      filters: ({ context }) => ({ organizationId: context.organizationId }),
      scopeKey: ({ context }) => context.organizationId,
      map: (event) => ({ customerName: event.items[0]?.name ?? "" }),
    }),
  },
  {
    key: "contactId",
    label: "联系人",
    type: "reference",
    form: { required: ({ model }) => model.customerId !== null },
    detail: true,
    reference: reference({
      source: contactSource,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        customerId: model.customerId,
      }),
      scopeKey: ({ context }) => context.organizationId,
      beforeOpen: ({ model }) => ({ allowed: model.customerId !== null, reason: "请先选择客户" }),
      map: (event) => ({
        contactName: event.items[0]?.name ?? "",
        contactPhone: event.items[0]?.phone ?? "",
      }),
    }),
  },
  { key: "contactPhone", label: "联系电话", type: "text", form: { readonly: true }, detail: true },
  {
    key: "title",
    label: "标题",
    type: "text",
    form: {
      required: true,
      readonly: ({ context }) => !context.canEdit,
      group: "基础字段",
      rules: {
        asyncValidator: async (_rule, value: string) => {
          // 仅模拟页面异步规则，用于验证过期结果不会污染新模型。
          if (value.startsWith("慢校验")) await new Promise((resolve) => setTimeout(resolve, 1500));
          if (value === "慢校验失败") throw new Error("实验异步校验失败");
        },
      },
    },
    detail: true,
    props: { maxlength: 60 },
  },
  {
    key: "amount",
    label: "金额",
    type: "number",
    emptyValue: null,
    form: { required: ({ model }) => model.enabled },
    detail: true,
    props: { min: 0, precision: 2 },
  },
  { key: "enabled", label: "启用", type: "switch", form: {}, detail: true },
  { key: "date", label: "业务日期", type: "date", form: {}, detail: true },
  { key: "month", label: "业务月份", type: "month", form: {}, detail: true },
  { key: "year", label: "业务年度", type: "year", form: {}, detail: true },
  { key: "appointment", label: "预约时间", type: "datetime", form: {}, detail: true },
  { key: "period", label: "有效日期范围", type: "dateRange", form: {}, detail: true },
  {
    key: "status",
    label: "字典状态",
    type: "dict",
    emptyValue: null,
    dict: { code: ({ context }) => context.dictCode, valueType: "preserve" },
    form: {},
    detail: true,
  },
  {
    key: "note",
    label: "备注（启用时必填）",
    type: "textarea",
    form: { span: 2, visible: ({ model }) => model.enabled, required: true },
    detail: true,
    props: { rows: 2 },
  },
  {
    key: "custom",
    label: "自定义优先级",
    type: "custom",
    form: {
      required: true,
      rules: {
        validator: (_rule, value: FormLabModel["custom"], callback) =>
          callback(
            value.priority >= 0 && value.priority <= 5
              ? undefined
              : new Error("优先级必须在 0—5 之间")
          ),
      },
    },
    detail: true,
  },
  {
    key: "image",
    label: "单图",
    type: "image",
    form: { group: "附件与内容", visible: ({ context }) => context.showAttachments },
    detail: true,
  },
  {
    key: "images",
    label: "多图",
    type: "images",
    form: { visible: ({ context }) => context.showAttachments },
    detail: true,
  },
  {
    key: "files",
    label: "附件",
    type: "files",
    form: { visible: ({ context }) => context.showAttachments, span: 2 },
    detail: true,
  },
  {
    key: "rich",
    label: "富文本",
    type: "rich",
    form: { visible: ({ context }) => context.showAttachments, span: 2 },
    detail: true,
  },
]);

export const links: readonly FieldLink<FormLabModel, FormLabContext>[] = [
  {
    watch: ["customerId"],
    writes: ["contactId", "contactName", "contactPhone"],
    clear: ["contactId", "contactName", "contactPhone"],
  },
];

export const searchFields = buildSearchFields<FormLabQuery, FormLabContext>()([
  { key: "keyword", label: "关键词", type: "text", search: { operator: "contains" } },
  {
    key: "minimum",
    label: "最小金额",
    type: "number",
    emptyValue: null,
    search: { operator: "eq" },
  },
  { key: "enabled", label: "启用", type: "switch", search: { operator: "eq", advanced: true } },
  {
    key: "period",
    label: "日期范围",
    type: "dateRange",
    search: { operator: "between", advanced: true },
  },
]);
