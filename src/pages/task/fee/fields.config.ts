import { defineFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldLink } from "@/components/business/fields/types";
import type { FeeItem } from "@/api/task/fee/types";
import type { FeeFormModel, FeePageContext } from "./types";
import { inventoryReference, principalPartyReference, providerPartyReference } from "./references";

export const feeFormFields = defineFields<FeeFormModel, FeePageContext>()([
  {
    key: "billCode",
    label: "单据编号",
    type: "text",
    form: { modes: ["edit"], readonly: true, group: "单据信息" },
    detail: { group: "单据信息" },
  },
  {
    key: "billDate",
    label: "单据日期",
    type: "date",
    form: { required: true, group: "单据信息" },
    detail: true,
  },
  {
    key: "principalPartyId",
    label: "委托方",
    type: "reference",
    form: { required: true, group: "往来单位" },
    detail: { group: "往来单位" },
    reference: createReferenceField<FeeFormModel, FeePageContext>()({
      source: principalPartyReference,
      filters: ({ context }) => ({
        organizationId: context.organizationId,
        role: "principal" as const,
      }),
      scopeKey: ({ context }) => `${context.scopeKey}:principal`,
    }),
  },
  {
    key: "providerPartyId",
    label: "服务方",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<FeeFormModel, FeePageContext>()({
      source: providerPartyReference,
      filters: ({ context }) => ({
        organizationId: context.organizationId,
        role: "provider" as const,
      }),
      scopeKey: ({ context }) => `${context.scopeKey}:provider`,
    }),
  },
  {
    key: "inventoryId",
    label: "药品",
    type: "reference",
    form: { required: true, group: "费用内容" },
    detail: { group: "费用内容" },
    reference: createReferenceField<FeeFormModel, FeePageContext>()({
      source: inventoryReference,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        ownerPartyId: model.principalPartyId,
      }),
      scopeKey: ({ model, context }) =>
        `${context.scopeKey}:inventory:${model.principalPartyId ?? "none"}`,
      beforeOpen: ({ model }) => ({
        allowed: !!model.principalPartyId,
        reason: model.principalPartyId ? undefined : "请先选择委托方",
      }),
      map: ({ items }) => ({
        businessName: items[0]?.businessName ?? "",
        factoryName: items[0]?.factoryName ?? "",
      }),
    }),
  },
  {
    key: "businessName",
    label: "事业组织",
    type: "text",
    form: { readonly: true },
    detail: true,
  },
  {
    key: "factoryName",
    label: "结算厂家",
    type: "text",
    form: { readonly: true },
    detail: true,
  },
  {
    key: "amount",
    label: "预算金额（元）",
    type: "amount",
    form: { required: true },
    detail: true,
    props: { placeholder: "0.00" },
  },
  {
    key: "attachments",
    label: "附件",
    type: "files",
    form: { group: "附件与备注", span: 2 },
    detail: { group: "附件与备注", span: 2 },
  },
  {
    key: "remark",
    label: "备注",
    type: "textarea",
    form: { span: 2 },
    detail: { span: 2 },
    props: { maxlength: 200, rows: 3 },
  },
  {
    key: "status",
    label: "审核状态",
    type: "dict",
    emptyValue: "draft",
    dict: { code: "pilot_document_status", valueType: "string" },
    form: false,
    detail: { group: "处理结果" },
  },
  {
    key: "generatedTaskText",
    label: "生成任务编号",
    type: "text",
    form: false,
    detail: true,
  },
  { key: "createdBy", label: "创建人", type: "text", form: false, detail: true },
  { key: "createdTime", label: "创建时间", type: "text", form: false, detail: true },
]);

export const feeLinks: readonly FieldLink<FeeFormModel, FeePageContext>[] = [
  {
    watch: ["principalPartyId"],
    writes: ["inventoryId", "businessName", "factoryName"],
    clear: ["inventoryId", "businessName", "factoryName"],
  },
];

export const feeListFields = defineFields<FeeItem, FeePageContext>()([
  { key: "billCode", label: "单据编号", type: "text", table: { minWidth: 135, sortable: true } },
  { key: "billDate", label: "单据日期", type: "date", table: { width: 115, sortable: true } },
  { key: "principalPartyName", label: "委托方", type: "text", table: { minWidth: 170 } },
  { key: "providerPartyName", label: "服务方", type: "text", table: { minWidth: 170 } },
  { key: "inventoryName", label: "药品", type: "text", table: { minWidth: 160 } },
  { key: "factoryName", label: "结算厂家", type: "text", table: { minWidth: 160 } },
  {
    key: "amount",
    label: "预算金额（元）",
    type: "amount",
    table: { width: 130, align: "right", sortable: true },
  },
  {
    key: "status",
    label: "审核状态",
    type: "dict",
    emptyValue: "draft",
    dict: { code: "pilot_document_status", valueType: "string" },
    table: { width: 100 },
  },
  {
    key: "createdTime",
    label: "创建时间",
    type: "datetime",
    table: { width: 165, sortable: true },
  },
]);
