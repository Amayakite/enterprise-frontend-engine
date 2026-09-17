import { buildSearchFields, defineFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldLink } from "@/components/business/fields/types";
import type { ServiceApplicationItem } from "@/api/service/application/types";
import { multiplyDecimals, toFixedDecimal } from "@/utils/decimal";
import type {
  ServiceApplicationFormModel,
  ServiceApplicationPageContext,
  ServiceApplicationSearchModel,
} from "./types";
import {
  geographyRegionSource,
  inventoryReference,
  principalPartyReference,
  providerPartyReference,
  serviceItemReference,
  serviceTargetReference,
} from "./references";

function calculatedAmount(model: Readonly<ServiceApplicationFormModel>) {
  if (model.calculateBasis === "person")
    return toFixedDecimal(multiplyDecimals(model.price || "0", model.personCount ?? 0));
  if (model.calculateBasis === "quantity")
    return toFixedDecimal(multiplyDecimals(model.price || "0", model.quantity ?? 0));
  return toFixedDecimal(model.price || "0");
}

export const serviceApplicationFields = defineFields<
  ServiceApplicationFormModel,
  ServiceApplicationPageContext
>()([
  {
    key: "applyCode",
    label: "服务单号",
    type: "text",
    form: { modes: ["edit"], readonly: true, group: "单据信息" },
    detail: { group: "单据信息" },
  },
  {
    key: "serviceDate",
    label: "服务日期",
    type: "date",
    form: { required: true, group: "单据信息" },
    detail: true,
  },
  {
    key: "principalPartyId",
    label: "委托方",
    type: "reference",
    form: { required: true, group: "往来与区域" },
    detail: { group: "往来与区域" },
    reference: createReferenceField<ServiceApplicationFormModel, ServiceApplicationPageContext>()({
      source: principalPartyReference,
      filters: ({ context }) => ({
        organizationId: context.organizationId,
        role: "principal" as const,
      }),
      scopeKey: ({ context }) => `${context.organizationId}:principal`,
    }),
  },
  {
    key: "providerPartyId",
    label: "服务方",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<ServiceApplicationFormModel, ServiceApplicationPageContext>()({
      source: providerPartyReference,
      filters: ({ context }) => ({
        organizationId: context.organizationId,
        role: "provider" as const,
      }),
      scopeKey: ({ context }) => `${context.organizationId}:provider`,
    }),
  },
  {
    key: "districtId",
    label: "省/市/区",
    type: "region",
    form: { required: true },
    detail: {
      format: (_value, { model }) =>
        [model.provinceName, model.cityName, model.districtName].filter(Boolean).join(" / "),
    },
    region: {
      source: geographyRegionSource,
      filters: ({ context }) => ({ organizationId: context.organizationId }),
      map: (items) => ({
        provinceId: items[0]?.id === undefined ? null : String(items[0].id),
        provinceName: items[0]?.name ?? "",
        cityId: items[1]?.id === undefined ? null : String(items[1].id),
        cityName: items[1]?.name ?? "",
        districtId: items[2]?.id === undefined ? null : String(items[2].id),
        districtName: items[2]?.name ?? "",
      }),
    },
  },
  {
    key: "inventoryId",
    label: "药品",
    type: "reference",
    form: { required: true, group: "服务内容" },
    detail: { group: "服务内容" },
    reference: createReferenceField<ServiceApplicationFormModel, ServiceApplicationPageContext>()({
      source: inventoryReference,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        ownerPartyId: model.principalPartyId,
      }),
      scopeKey: ({ model, context }) =>
        `${context.organizationId}:${model.principalPartyId ?? "none"}`,
      beforeOpen: ({ model }) => ({
        allowed: !!model.principalPartyId,
        reason: model.principalPartyId ? undefined : "请先选择委托方",
      }),
      map: ({ items }) => ({ factoryName: items[0]?.factoryName ?? "" }),
    }),
  },
  {
    key: "factoryName",
    label: "结算厂家",
    type: "text",
    form: { readonly: true },
    detail: true,
  },
  {
    key: "serviceItemId",
    label: "服务项目",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<ServiceApplicationFormModel, ServiceApplicationPageContext>()({
      source: serviceItemReference,
      filters: ({ context }) => ({ organizationId: context.organizationId, projectId: null }),
      scopeKey: ({ context }) => `${context.organizationId}:all`,
      map: ({ items }) => ({
        serviceCategory: items[0]?.category ?? "",
        serviceUnit: items[0]?.unit ?? "",
        calculateBasis: items[0]?.calculateBasis ?? "fixed",
        price: items[0]?.price ?? "0.00",
        targetType: items[0]?.targetType ?? "outlet",
      }),
    }),
  },
  {
    key: "serviceCategory",
    label: "服务类别",
    type: "text",
    form: { readonly: true },
    detail: true,
  },
  {
    key: "serviceUnit",
    label: "项目单位",
    type: "text",
    form: { readonly: true },
    detail: true,
  },
  {
    key: "calculateBasis",
    label: "计算基准",
    type: "dict",
    emptyValue: "fixed",
    dict: { code: "pilot_calculate_basis", valueType: "string" },
    form: { readonly: true },
    detail: true,
  },
  {
    key: "targetType",
    label: "服务对象类型",
    type: "dict",
    emptyValue: "outlet",
    dict: { code: "pilot_target_type", valueType: "string" },
    form: { required: true },
    detail: true,
  },
  {
    key: "targetId",
    label: "服务对象",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<ServiceApplicationFormModel, ServiceApplicationPageContext>()({
      source: serviceTargetReference,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        targetType: model.targetType,
        providerPartyId: model.providerPartyId,
      }),
      scopeKey: ({ model, context }) =>
        `${context.organizationId}:${model.targetType}:${model.providerPartyId ?? "none"}`,
      beforeOpen: ({ model }) => ({
        allowed: !!model.providerPartyId,
        reason: model.providerPartyId ? undefined : "请先选择服务方",
      }),
      map: ({ items }) => ({
        provinceId: items[0]?.provinceId ?? null,
        provinceName: items[0]?.provinceName ?? "",
        cityId: items[0]?.cityId ?? null,
        cityName: items[0]?.cityName ?? "",
        districtId: items[0]?.districtId ?? null,
        districtName: items[0]?.districtName ?? "",
      }),
    }),
  },
  {
    key: "price",
    label: "服务定价（元）",
    type: "amount",
    form: { readonly: true, group: "数量与金额" },
    detail: { group: "数量与金额" },
  },
  {
    key: "personCount",
    label: "人数",
    type: "number",
    emptyValue: null,
    form: {
      visible: ({ model }) => model.calculateBasis === "person",
      required: ({ model }) => model.calculateBasis === "person",
    },
    detail: true,
    props: { min: 1, precision: 0 },
  },
  {
    key: "quantity",
    label: "数量",
    type: "number",
    emptyValue: null,
    form: {
      visible: ({ model }) => model.calculateBasis !== "fixed",
      required: ({ model }) => model.calculateBasis === "quantity",
    },
    detail: true,
    props: { min: 1, precision: 0 },
  },
  {
    key: "amount",
    label: "申请金额（元）",
    type: "amount",
    form: { readonly: true },
    detail: true,
  },
  {
    key: "remark",
    label: "备注",
    type: "textarea",
    form: { group: "备注", span: 2 },
    detail: { group: "备注", span: 2 },
    props: { maxlength: 200, rows: 3 },
  },
  {
    key: "status",
    label: "审核状态",
    type: "dict",
    emptyValue: "draft",
    dict: { code: "pilot_document_status", valueType: "string" },
    form: false,
    detail: { group: "处理信息" },
  },
  { key: "createdBy", label: "创建人", type: "text", form: false, detail: true },
  { key: "createdTime", label: "创建时间", type: "text", form: false, detail: true },
]);

export const serviceApplicationLinks: readonly FieldLink<
  ServiceApplicationFormModel,
  ServiceApplicationPageContext
>[] = [
  {
    watch: ["principalPartyId"],
    writes: ["inventoryId", "factoryName"],
    clear: ["inventoryId", "factoryName"],
  },
  { watch: ["providerPartyId"], writes: ["targetId"], clear: ["targetId"] },
  { watch: ["serviceItemId"], writes: ["targetId"], clear: ["targetId"] },
  { watch: ["targetType"], writes: ["targetId"], clear: ["targetId"] },
  {
    watch: ["serviceItemId", "calculateBasis", "price", "personCount", "quantity"],
    writes: ["amount"],
    apply: ({ model }) => ({ amount: calculatedAmount(model) }),
  },
];

export const serviceApplicationSearchFields = buildSearchFields<
  ServiceApplicationSearchModel,
  ServiceApplicationPageContext
>()([
  { key: "keyword", label: "关键词", type: "text", search: { operator: "contains" } },
  {
    key: "status",
    label: "审核状态",
    type: "dict",
    emptyValue: "",
    dict: { code: "pilot_document_status", valueType: "string" },
    search: { operator: "eq" },
  },
  {
    key: "serviceDateRange",
    label: "服务日期",
    type: "dateRange",
    emptyValue: null,
    search: { operator: "between", advanced: true },
  },
]);

export const serviceApplicationListFields = defineFields<
  ServiceApplicationItem,
  ServiceApplicationPageContext
>()([
  { key: "applyCode", label: "服务单号", type: "text", table: { minWidth: 140, sortable: true } },
  { key: "serviceDate", label: "服务日期", type: "date", table: { width: 115, sortable: true } },
  { key: "principalPartyName", label: "委托方", type: "text", table: { minWidth: 170 } },
  { key: "providerPartyName", label: "服务方", type: "text", table: { minWidth: 170 } },
  { key: "targetName", label: "服务对象", type: "text", table: { minWidth: 170 } },
  { key: "inventoryName", label: "药品", type: "text", table: { minWidth: 150 } },
  { key: "serviceItemName", label: "服务项目", type: "text", table: { minWidth: 160 } },
  {
    key: "amount",
    label: "申请金额",
    type: "amount",
    table: { width: 120, align: "right", sortable: true },
  },
  {
    key: "status",
    label: "审核状态",
    type: "dict",
    emptyValue: "draft",
    dict: { code: "pilot_document_status", valueType: "string" },
    table: { width: 100 },
  },
]);
