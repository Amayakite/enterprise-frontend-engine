import API from "@/api/crud-lab";
import { crudLabSchema } from "@/api/crud-lab/query";
import { defineCrudConfig } from "@/components/business/crud/config";
import { emptyAppliedQuery } from "@/components/business/search/model";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import { toFixedDecimal } from "@/utils/decimal";
import type { CrudAction, CrudNavigation, CrudSaveInput } from "@/components/business/crud/types";
import type { FieldDefinition } from "@/components/business/fields/types";
import type {
  CrudLabCreate,
  CrudLabEntity,
  CrudLabLine,
  CrudLabQuery,
  CrudLabReceipt,
  CrudLabRow,
  CrudLabScope,
  CrudLabUpdate,
} from "@/api/crud-lab/types";
import type { CrudLabControls, CrudLabModel } from "./types";

class DemonstrationRejection extends Error {}
const categoryOptions = [
  { label: "常规", value: "regular" },
  { label: "加急", value: "urgent" },
] as const;
const statusOptions = [
  { label: "草稿", value: "draft" },
  { label: "已确认", value: "confirmed" },
] as const;
export const lineFields: readonly FieldDefinition<CrudLabLine, CrudLabScope>[] = [
  {
    key: "name",
    label: "明细名称",
    type: "text",
    form: { required: true },
    table: { minWidth: 220 },
  },
  {
    key: "quantity",
    label: "数量",
    type: "number",
    props: { min: 1 },
    form: { required: true, rules: { type: "number", min: 1, message: "数量至少为 1" } },
    table: { width: 180 },
  },
];
export const newLine = (): CrudLabLine => ({ id: crypto.randomUUID(), name: "", quantity: 1 });
export const lineKey = (row: Readonly<CrudLabLine>) => row.id;
const fields: readonly FieldDefinition<CrudLabModel, CrudLabScope>[] = [
  {
    key: "code",
    label: "编号",
    type: "text",
    help: "保存后由服务端生成",
    form: { readonly: true, group: "基本信息" },
    detail: { group: "基本信息" },
  },
  {
    key: "title",
    label: "名称",
    type: "text",
    form: { required: true },
    props: { maxlength: 80 },
    detail: true,
  },
  {
    key: "category",
    label: "类型",
    type: "select",
    options: categoryOptions,
    form: { required: true },
    detail: true,
  },
  { key: "billDate", label: "业务日期", type: "date", form: { required: true }, detail: true },
  {
    key: "amount",
    label: "金额",
    type: "text",
    formatHint: "decimal",
    form: { required: true },
    detail: { group: "业务信息", format: (value) => toFixedDecimal(value) },
  },
  {
    key: "status",
    label: "状态",
    type: "select",
    options: statusOptions,
    form: { readonly: true },
    detail: true,
  },
  {
    key: "note",
    label: "业务备注",
    type: "custom",
    help: "此字段用公开插槽演示特殊输入",
    form: { span: 2 },
    detail: true,
  },
];
const listFields: readonly FieldDefinition<CrudLabRow, CrudLabScope>[] = [
  { key: "code", label: "编号", type: "text" },
  { key: "title", label: "名称", type: "text" },
  { key: "category", label: "类型", type: "select", options: categoryOptions },
  { key: "billDate", label: "业务日期", type: "date" },
  {
    key: "amount",
    label: "金额",
    type: "text",
    formatHint: "decimal",
    table: { align: "right", format: (value) => toFixedDecimal(value) },
  },
  { key: "status", label: "状态", type: "select", options: statusOptions },
];
const toModel = (entity: CrudLabEntity): CrudLabModel => ({
  title: entity.title,
  code: entity.code,
  category: entity.category,
  billDate: entity.billDate,
  amount: entity.amount,
  status: entity.status,
  note: entity.note,
  lines: entity.lines.map((row) => ({ ...row })),
});
const payload = (
  input: CrudSaveInput<CrudLabModel, CrudLabEntity, number, CrudLabScope>
): CrudLabCreate => {
  const model = cloneReadonlyModel<CrudLabModel>(input.model);
  return {
    title: model.title,
    category: model.category,
    billDate: model.billDate,
    amount: model.amount,
    note: model.note,
    lines: model.lines,
  };
};
export function createLabConfig(navigation: CrudNavigation<number>, controls: CrudLabControls) {
  const actions = <Row extends CrudLabRow>(
    detail = false
  ): readonly CrudAction<Row, number, CrudLabScope>[] => [
    {
      key: "confirm",
      label: "确认",
      location: "row",
      disabledReason: ({ row }) => (row.status !== "draft" ? "仅草稿可确认" : undefined),
      confirm: ({ row }) => ({ title: "确认记录", message: `确定确认 ${row.code} 吗？` }),
      execute: async ({ rowKey, context, signal }) => {
        await API.confirm(rowKey, context.organizationId, signal);
        return { affectedKeys: [rowKey], message: "记录已确认" };
      },
    },
    {
      key: "delete",
      label: "删除",
      tone: "danger",
      location: "row",
      confirm: ({ row }) => ({ title: "删除记录", message: `确定删除 ${row.code} 及全部明细吗？` }),
      execute: async ({ rowKey, context, signal }) => {
        await API.remove(rowKey, context.organizationId, signal);
        return { affectedKeys: [rowKey], message: "记录已删除" };
      },
      refresh: detail ? "none" : "current-page",
      afterExecute: detail
        ? async () => {
            await navigation.close?.();
          }
        : undefined,
    },
  ];
  return defineCrudConfig<
    CrudLabRow,
    CrudLabEntity,
    CrudLabModel,
    number,
    typeof crudLabSchema,
    CrudLabScope,
    CrudLabQuery,
    CrudLabCreate,
    CrudLabUpdate,
    CrudLabReceipt,
    CrudLabScope
  >({
    key: "crud-lab",
    list: {
      getKey: (row) => row.id,
      fields: listFields,
      columns: [
        { key: "code", label: "编号", width: 140, sortable: true, link: "detail" },
        { key: "title", label: "名称", minWidth: 220, sortable: true },
        { key: "category", label: "类型", width: 100 },
        { key: "billDate", label: "业务日期", width: 150, sortable: true },
        { key: "amount", label: "金额", width: 140, align: "right", sortable: true },
        { key: "status", label: "状态", width: 110 },
      ],
      query: { schema: crudLabSchema, initial: emptyAppliedQuery<typeof crudLabSchema>() },
      scope: (context) => ({ key: context.organizationId, value: context }),
      toQuery: (request) => ({
        ...request,
        fail: controls.failList,
        delayMs: controls.delay ? 1200 : 0,
      }),
      request: (query, context) => API.search(query, context.signal),
      pageSize: 10,
      selection: "multiple",
      actions: actions<CrudLabRow>(),
    },
    form: {
      fields,
      sections: [{ key: "lines", label: "业务明细" }],
      childKeys: ["lines"],
      createInitial: () => ({
        title: "",
        code: "",
        category: "regular",
        billDate: "2026-09-10",
        amount: "0.00",
        status: "draft",
        note: "",
        lines: [newLine()],
      }),
      load: (id, context) => API.load(id, context.context.organizationId, context.signal),
      toModel,
      readonlyReason: (model) => (model.status === "confirmed" ? "已确认记录不可编辑" : undefined),
      validate: async (input) =>
        input.model.lines.length
          ? { valid: true }
          : { valid: false, issues: [{ section: "lines", message: "至少需要一条明细" }] },
      toCreate: payload,
      toUpdate: (input) => ({ ...payload(input), version: input.baseline.version }),
      create: async (dto, request) => {
        if (controls.failSave) throw new DemonstrationRejection("实验保存被明确拒绝，输入已保留");
        return API.create(dto, request.context.organizationId, request.signal);
      },
      update: async (id, dto, request) => {
        if (controls.failSave) throw new DemonstrationRejection("实验保存被明确拒绝，输入已保留");
        return API.update(id, dto, request.context.organizationId, request.signal);
      },
      classifySaveError: (cause) =>
        cause instanceof DemonstrationRejection ? "rejected" : "unknown",
      resolveSaved: (receipt, input) =>
        API.load(receipt.id, input.context.organizationId, input.signal, controls.failSync),
      getKey: (entity) => entity.id,
      afterSave: async () => {
        if (controls.failAfterSave) throw new Error("实验后置处理失败");
      },
    },
    detail: {
      fields,
      tabs: [
        { key: "lines", label: "明细" },
        { key: "audit", label: "业务说明" },
      ],
      load: (id, context) => API.load(id, context.context.organizationId, context.signal),
      toModel,
      actions: actions<CrudLabEntity>(true),
    },
    navigation,
  });
}
