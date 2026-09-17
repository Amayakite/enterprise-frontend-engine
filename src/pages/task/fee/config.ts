import FeeAPI from "@/api/task/fee";
import { feeQuerySchema, feeSortKeys, toFeeSearchRequest } from "@/api/task/fee/query";
import type {
  FeeItem,
  FeeSavePayload,
  FeeSaveResult,
  FeeSearchRequest,
} from "@/api/task/fee/types";
import { defineCrudConfig } from "@/components/business/crud/config";
import type {
  CrudAction,
  CrudDetailConfig,
  CrudIssue,
  CrudNavigation,
  CrudSaveInput,
} from "@/components/business/crud/types";
import {
  checkQuerySort,
  emptyAppliedQuery,
  withQueryInputs,
} from "@/components/business/search/model";
import { createQueryReference } from "@/components/business/search/reference";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import { toDecimal } from "@/utils/decimal";
import { classifyRequestSaveError } from "@/utils/request-error";
import { createInitialFeeForm, toFeeForm, toFeePayload } from "./adapters";
import { feeFormFields, feeLinks, feeListFields } from "./fields.config";
import { principalPartyReference, providerPartyReference } from "./references";
import type { FeeFormModel, FeePageContext } from "./types";

type FeeUpdatePayload = FeeSavePayload & { version: number };
const feeListSchema = withQueryInputs(feeQuerySchema, {
  principalPartyId: createQueryReference({
    source: principalPartyReference,
    filters: () => ({ organizationId: "org-a", role: "principal" }) as const,
    scopeKey: () => "task-fee-query:org-a:principal",
  }),
  providerPartyId: createQueryReference({
    source: providerPartyReference,
    filters: () => ({ organizationId: "org-a", role: "provider" }) as const,
    scopeKey: () => "task-fee-query:org-a:provider",
  }),
});

function selectedReason(
  rows: readonly { status: FeeItem["status"] }[],
  required: FeeItem["status"],
  empty: string
) {
  if (!rows.length) return empty;
  return rows.every((row) => row.status === required)
    ? undefined
    : required === "draft"
      ? "仅草稿单据可执行此操作"
      : "仅已审核单据可执行此操作";
}

function feeListActions(): readonly CrudAction<FeeItem, string, FeePageContext>[] {
  return [
    {
      key: "approve-selected",
      label: "批量审核",
      location: "toolbar",
      permission: "task:fee:approve",
      disabledReason: ({ selectedRows }) =>
        selectedReason(selectedRows, "draft", "请选择要审核的单据"),
      confirm: ({ selectedKeys }) => ({
        title: "批量审核",
        message: `确定审核选中的 ${selectedKeys.length} 张任务费用单据吗？`,
      }),
      execute: async ({ selectedKeys, signal }) => {
        const result = await FeeAPI.approve({ ids: [...selectedKeys] }, signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已审核" };
      },
    },
    {
      key: "revoke-selected",
      label: "批量弃审",
      location: "toolbar",
      permission: "task:fee:revoke",
      disabledReason: ({ selectedRows }) =>
        selectedReason(selectedRows, "approved", "请选择要弃审的单据"),
      confirm: ({ selectedKeys }) => ({
        title: "批量弃审",
        message: `确定撤销选中的 ${selectedKeys.length} 张任务费用单据审核吗？`,
      }),
      execute: async ({ selectedKeys, signal }) => {
        const result = await FeeAPI.revoke({ ids: [...selectedKeys] }, signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已撤销审核" };
      },
    },
    {
      key: "delete-selected",
      label: "批量删除",
      tone: "danger",
      location: "toolbar",
      permission: "task:fee:delete",
      disabledReason: ({ selectedRows }) =>
        selectedReason(selectedRows, "draft", "请选择要删除的单据"),
      confirm: ({ selectedKeys }) => ({
        title: "批量删除",
        message: `确定删除选中的 ${selectedKeys.length} 张任务费用单据吗？`,
      }),
      execute: async ({ selectedKeys, signal }) => {
        const result = await FeeAPI.remove([...selectedKeys], signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已删除" };
      },
    },
    {
      key: "delete",
      label: "删除",
      tone: "danger",
      location: "row",
      permission: "task:fee:delete",
      disabledReason: ({ row }) => (row.status === "approved" ? "已审核单据不能删除" : undefined),
      confirm: ({ row }) => ({ title: "删除任务费用", message: `确定删除 ${row.billCode} 吗？` }),
      execute: async ({ rowKey, signal }) => {
        const result = await FeeAPI.remove([rowKey], signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已删除" };
      },
    },
  ];
}

function feeDetailActions(
  navigation: CrudNavigation<string>
): readonly CrudAction<FeeItem, string, FeePageContext>[] {
  return [
    {
      key: "approve",
      label: "审核",
      location: "row",
      permission: "task:fee:approve",
      visible: ({ row }) => row.status === "draft",
      confirm: ({ row }) => ({ title: "审核任务费用", message: `确定审核 ${row.billCode} 吗？` }),
      execute: async ({ rowKey, signal }) => {
        const result = await FeeAPI.approve({ ids: [rowKey] }, signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已审核" };
      },
    },
    {
      key: "revoke",
      label: "弃审",
      location: "row",
      permission: "task:fee:revoke",
      visible: ({ row }) => row.status === "approved",
      confirm: ({ row }) => ({ title: "撤销审核", message: `确定撤销 ${row.billCode} 的审核吗？` }),
      execute: async ({ rowKey, signal }) => {
        const result = await FeeAPI.revoke({ ids: [rowKey] }, signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已撤销审核" };
      },
    },
    {
      key: "delete",
      label: "删除",
      tone: "danger",
      location: "row",
      permission: "task:fee:delete",
      disabledReason: ({ row }) => (row.status === "approved" ? "已审核单据不能删除" : undefined),
      confirm: ({ row }) => ({ title: "删除任务费用", message: `确定删除 ${row.billCode} 吗？` }),
      execute: async ({ rowKey, signal }) => {
        const result = await FeeAPI.remove([rowKey], signal);
        return { affectedKeys: result.affectedIds, message: "任务费用已删除" };
      },
      refresh: "none",
      afterExecute: async () => {
        await navigation.close?.();
      },
    },
  ];
}

const payload = (input: CrudSaveInput<FeeFormModel, FeeItem, string, FeePageContext>) =>
  toFeePayload(cloneReadonlyModel<FeeFormModel>(input.model));

export function createFeeCrud(navigation: CrudNavigation<string>) {
  return defineCrudConfig<
    FeeItem,
    FeeItem,
    FeeFormModel,
    string,
    typeof feeQuerySchema,
    { organizationId: string },
    FeeSearchRequest,
    FeeSavePayload,
    FeeUpdatePayload,
    FeeSaveResult,
    FeePageContext
  >({
    key: "task-fee",
    list: {
      getKey: (row) => row.id,
      fields: feeListFields,
      columns: [
        { key: "billCode", label: "单据编号", width: 145, sortable: true, link: "detail" },
        { key: "billDate", label: "单据日期", width: 116, sortable: true },
        { key: "principalPartyName", label: "委托方", minWidth: 175 },
        { key: "providerPartyName", label: "服务方", minWidth: 175 },
        { key: "inventoryName", label: "药品", minWidth: 165 },
        { key: "factoryName", label: "结算厂家", minWidth: 165 },
        { key: "amount", label: "预算金额（元）", width: 135, align: "right", sortable: true },
        { key: "status", label: "审核状态", width: 100 },
        { key: "createdTime", label: "创建时间", width: 165, sortable: true },
      ],
      query: { schema: feeListSchema, initial: emptyAppliedQuery<typeof feeQuerySchema>() },
      scope: (context) => ({
        key: `${context.scopeKey}:task-fee`,
        value: { organizationId: context.organizationId },
      }),
      toQuery: (request) =>
        toFeeSearchRequest({ ...request, sort: checkQuerySort(request.sort, feeSortKeys) }),
      request: (query, request) => FeeAPI.search(query, request.signal),
      pageSize: 20,
      initialSort: { key: "createdTime", order: "desc" },
      selection: "multiple",
      editDisabledReason: (row) => (row.status === "approved" ? "已审核单据需先弃审" : undefined),
      actions: feeListActions(),
    },
    form: {
      permissions: { create: "task:fee:create", update: "task:fee:update" },
      fields: feeFormFields,
      createInitial: createInitialFeeForm,
      load: (id, request) => FeeAPI.getDetail(id, request.signal),
      toModel: toFeeForm,
      readonlyReason: (model) =>
        model.status === "approved" ? "已审核任务费用需先弃审再编辑" : undefined,
      validate: async (input) => {
        const issues: CrudIssue<FeeFormModel>[] = [];
        try {
          if (toDecimal(input.model.amount || "0").lessThanOrEqualTo(0))
            issues.push({ field: "amount", message: "预算金额必须大于 0" });
        } catch {
          issues.push({ field: "amount", message: "预算金额格式不正确" });
        }
        return issues.length ? { valid: false, issues } : { valid: true };
      },
      toCreate: payload,
      toUpdate: (input) => ({ ...payload(input), version: input.baseline.version }),
      create: (value, request) => FeeAPI.create(value, request.signal),
      update: (id, value, request) => FeeAPI.update(id, value, request.signal),
      classifySaveError: classifyRequestSaveError,
      resolveSaved: (receipt, input) => FeeAPI.getDetail(receipt.id, input.signal),
      getKey: (record) => record.id,
      feedback: { saved: "任务费用已保存" },
    },
    navigation,
  });
}

export function createFeeDetailConfig(
  navigation: CrudNavigation<string>
): CrudDetailConfig<FeeItem, FeeFormModel, string, FeePageContext> {
  return {
    load: (id, request) => FeeAPI.getDetail(id, request.signal),
    toModel: toFeeForm,
    fields: feeFormFields,
    actions: feeDetailActions(navigation),
  };
}

export { feeFormFields, feeLinks };
