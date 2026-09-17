import { buildSearchFields, defineFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldLink } from "@/components/business/fields/types";
import type { MeetingApplicationItem } from "@/api/task/meeting-application/types";
import type {
  MeetingApplicationFormModel,
  MeetingApplicationPageContext,
  MeetingApplicationSearchModel,
} from "./types";
import {
  inventoryReference,
  principalPartyReference,
  projectReference,
  providerPartyReference,
  serviceItemReference,
  serviceTargetReference,
} from "./references";

export const meetingApplicationFields = defineFields<
  MeetingApplicationFormModel,
  MeetingApplicationPageContext
>()([
  {
    key: "applyCode",
    label: "会议申请单号",
    type: "text",
    form: { modes: ["edit"], readonly: true, group: "单据信息" },
    detail: { group: "单据信息" },
  },
  {
    key: "meetingDate",
    label: "会议日期",
    type: "date",
    form: { required: true, group: "单据信息" },
    detail: true,
  },
  {
    key: "principalPartyId",
    label: "委托方",
    type: "reference",
    form: { required: true, group: "业务基础" },
    detail: { group: "业务基础" },
    reference: createReferenceField<MeetingApplicationFormModel, MeetingApplicationPageContext>()({
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
    reference: createReferenceField<MeetingApplicationFormModel, MeetingApplicationPageContext>()({
      source: providerPartyReference,
      filters: ({ context }) => ({
        organizationId: context.organizationId,
        role: "provider" as const,
      }),
      scopeKey: ({ context }) => `${context.organizationId}:provider`,
    }),
  },
  {
    key: "projectId",
    label: "活动服务立项",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<MeetingApplicationFormModel, MeetingApplicationPageContext>()({
      source: projectReference,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        principalPartyId: model.principalPartyId,
      }),
      scopeKey: ({ model, context }) =>
        `${context.organizationId}:${model.principalPartyId ?? "none"}`,
      beforeOpen: ({ model }) => ({
        allowed: !!model.principalPartyId,
        reason: model.principalPartyId ? undefined : "请先选择委托方",
      }),
    }),
  },
  {
    key: "serviceItemId",
    label: "服务项目",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<MeetingApplicationFormModel, MeetingApplicationPageContext>()({
      source: serviceItemReference,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        projectId: model.projectId,
      }),
      scopeKey: ({ model, context }) => `${context.organizationId}:${model.projectId ?? "none"}`,
      beforeOpen: ({ model }) => ({
        allowed: !!model.projectId,
        reason: model.projectId ? undefined : "请先选择活动服务立项",
      }),
      map: ({ items }) => ({ targetType: items[0]?.targetType ?? "outlet" }),
    }),
  },
  {
    key: "inventoryId",
    label: "药品",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<MeetingApplicationFormModel, MeetingApplicationPageContext>()({
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
    }),
  },
  {
    key: "targetType",
    label: "参会对象类型",
    type: "dict",
    emptyValue: "outlet",
    dict: { code: "pilot_target_type", valueType: "string" },
    form: { readonly: true },
    detail: true,
  },
  {
    key: "targetId",
    label: "网点/商业",
    type: "reference",
    form: { required: true },
    detail: true,
    reference: createReferenceField<MeetingApplicationFormModel, MeetingApplicationPageContext>()({
      source: serviceTargetReference,
      filters: ({ model, context }) => ({
        organizationId: context.organizationId,
        targetType: model.targetType,
        providerPartyId: model.providerPartyId,
      }),
      scopeKey: ({ model, context }) =>
        `${context.organizationId}:${model.targetType}:${model.providerPartyId ?? "none"}`,
      beforeOpen: ({ model }) => ({
        allowed: !!model.providerPartyId && !!model.serviceItemId,
        reason:
          model.providerPartyId && model.serviceItemId ? undefined : "请先选择服务方和服务项目",
      }),
      map: ({ items }) => ({
        address: items[0]
          ? `${items[0].provinceName}${items[0].cityName}${items[0].districtName}`
          : "",
      }),
    }),
  },
  {
    key: "meetingName",
    label: "会议名称",
    type: "text",
    form: { required: true, group: "会议信息", span: 2 },
    detail: { group: "会议信息", span: 2 },
    props: { maxlength: 100 },
  },
  {
    key: "serviceTitle",
    label: "会议主题",
    type: "text",
    form: { required: true, span: 2 },
    detail: { span: 2 },
    props: { maxlength: 100 },
  },
  {
    key: "address",
    label: "会议地址",
    type: "textarea",
    form: { required: true, span: 2 },
    detail: { span: 2 },
    props: { maxlength: 200, rows: 2 },
  },
  {
    key: "controlLocation",
    label: "管控签到位置",
    type: "switch",
    form: { group: "签到位置" },
    detail: { group: "签到位置" },
  },
  {
    key: "longitude",
    label: "签到经纬度",
    type: "text",
    form: {
      visible: ({ model }) => model.controlLocation,
      required: ({ model }) => model.controlLocation,
      span: 2,
    },
    detail: {
      format: (_value, { model }) =>
        model.longitude && model.latitude ? `${model.longitude}, ${model.latitude}` : "",
    },
  },
  {
    key: "latitude",
    label: "纬度",
    type: "text",
    form: false,
    detail: false,
  },
  {
    key: "budgetTotal",
    label: "费用预算合计（元）",
    type: "amount",
    form: { readonly: true, group: "费用" },
    detail: { group: "费用" },
  },
  {
    key: "amount",
    label: "申请金额（元）",
    type: "amount",
    form: { required: true },
    detail: true,
    props: { placeholder: "0.00" },
  },
  {
    key: "attachments",
    label: "红头文件/附件",
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
    props: { maxlength: 300, rows: 3 },
  },
  {
    key: "status",
    label: "申请状态",
    type: "dict",
    emptyValue: "draft",
    dict: { code: "pilot_meeting_status", valueType: "string" },
    form: false,
    detail: { group: "处理信息" },
  },
  { key: "createdBy", label: "创建人", type: "text", form: false, detail: true },
  { key: "createdTime", label: "创建时间", type: "text", form: false, detail: true },
]);

export const meetingApplicationLinks: readonly FieldLink<
  MeetingApplicationFormModel,
  MeetingApplicationPageContext
>[] = [
  {
    watch: ["principalPartyId"],
    writes: ["projectId", "serviceItemId", "inventoryId", "targetId"],
    clear: ["projectId", "serviceItemId", "inventoryId", "targetId"],
  },
  { watch: ["providerPartyId"], writes: ["targetId"], clear: ["targetId"] },
  {
    watch: ["projectId"],
    writes: ["serviceItemId", "inventoryId", "targetId"],
    clear: ["serviceItemId", "inventoryId", "targetId"],
  },
  { watch: ["serviceItemId"], writes: ["targetId"], clear: ["targetId"] },
  { watch: ["targetType"], writes: ["targetId"], clear: ["targetId"] },
];

export const meetingApplicationSearchFields = buildSearchFields<
  MeetingApplicationSearchModel,
  MeetingApplicationPageContext
>()([
  { key: "keyword", label: "关键词", type: "text", search: { operator: "contains" } },
  {
    key: "status",
    label: "申请状态",
    type: "dict",
    emptyValue: "",
    dict: { code: "pilot_meeting_status", valueType: "string" },
    search: { operator: "eq" },
  },
]);

export const meetingApplicationListFields = defineFields<
  MeetingApplicationItem,
  MeetingApplicationPageContext
>()([
  { key: "applyCode", label: "申请单号", type: "text", table: { minWidth: 140, sortable: true } },
  { key: "meetingDate", label: "会议日期", type: "date", table: { width: 115, sortable: true } },
  { key: "meetingName", label: "会议名称", type: "text", table: { minWidth: 200 } },
  { key: "projectName", label: "活动服务立项", type: "text", table: { minWidth: 200 } },
  { key: "providerPartyName", label: "服务方", type: "text", table: { minWidth: 170 } },
  { key: "budgetTotal", label: "预算合计", type: "text", table: { width: 115, align: "right" } },
  {
    key: "amount",
    label: "申请金额",
    type: "amount",
    table: { width: 115, align: "right", sortable: true },
  },
  {
    key: "status",
    label: "申请状态",
    type: "dict",
    emptyValue: "draft",
    dict: { code: "pilot_meeting_status", valueType: "string" },
    table: { width: 100 },
  },
]);
