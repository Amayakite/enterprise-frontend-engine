// 仅供编译验收；不进入应用，不发送请求。
import type {
  QuerySchema,
  QueryCondition,
  QueryGroup,
  QueryEnvelope,
} from "@/components/business/search/types";
import type {
  CrudConfig,
  CrudFormConfig,
  CrudAction,
  CrudFormSlots,
  CrudListSlots,
  CrudOptionField,
  CrudChildBinding,
} from "@/components/business/crud/types";
import type {
  CustomerRecord,
  CustomerSavePayload,
  CustomerQueryParams,
} from "@/api/base/customer/types";
import type { CustomerFormModel, CustomerPageContext } from "@/pages/base/customer/types";
import type { FeeItem, FeeSavePayload, FeeSaveResult } from "@/api/task/fee/types";
import type { FeeFormModel, FeePageContext } from "@/pages/task/fee/types";

const schema = {
  name: {
    label: "名称",
    kind: "text",
    entries: ["quick", "advanced"],
    operators: ["contains", "eq", "isEmpty"],
  },
  active: { label: "启用", kind: "boolean", entries: ["normal"], operators: ["eq"] },
  amount: { label: "金额", kind: "decimal", entries: ["advanced"], operators: ["between", "gte"] },
  count: { label: "数量", kind: "number", entries: ["advanced"], operators: ["eq"] },
  organizationId: {
    label: "组织",
    kind: "reference",
    valueType: "number",
    entries: ["normal"],
    operators: ["eq", "in"],
  },
  status: {
    label: "状态",
    kind: "enum",
    options: [
      { label: "待审", value: "pending" },
      { label: "已审", value: "approved" },
    ],
    entries: ["normal"],
    operators: ["eq", "in"],
  },
} as const satisfies QuerySchema;
type S = typeof schema;
const zero: QueryCondition<S> = {
  kind: "condition",
  id: "zero",
  field: "organizationId",
  operator: "eq",
  value: 0,
};
const disabled: QueryCondition<S> = {
  kind: "condition",
  id: "disabled",
  field: "active",
  operator: "eq",
  value: false,
};
const amount: QueryCondition<S> = {
  kind: "condition",
  id: "amount",
  field: "amount",
  operator: "between",
  value: ["0.00", "10.00"],
};
const group: QueryGroup<S> = {
  kind: "group",
  id: "root",
  operator: "or",
  children: [zero, disabled, amount],
};
const envelope: QueryEnvelope<S, { organizationId: string }> = {
  scope: { key: "user-a:org-a:1", value: { organizationId: "org-a" } },
  where: group,
};
const wrongField: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  // @ts-expect-error 字段必须来自 schema
  field: "missing",
  operator: "eq",
  value: "x",
};
// @ts-expect-error 布尔值不接受字符串
const wrongBoolean: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "active",
  operator: "eq",
  value: "false",
};
// @ts-expect-error 数字 ID 不转字符串
const wrongId: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "organizationId",
  operator: "eq",
  value: "0",
};
const wrongOperator: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "name",
  // @ts-expect-error 每个字段还有实际运算符白名单
  operator: "ne",
  value: "x",
};
// @ts-expect-error 金额保持十进制字符串
const wrongDecimal: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "amount",
  operator: "gte",
  value: 1,
};
const wrongRange: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "amount",
  operator: "between",
  // @ts-expect-error 区间必须两个端点
  value: ["1"],
};
const emptyMembers: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "organizationId",
  operator: "in",
  // @ts-expect-error 成员条件不接受空数组
  value: [],
};
// @ts-expect-error 空值运算不携带参数
const wrongEmpty: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "name",
  operator: "isEmpty",
  value: "",
};
// @ts-expect-error 枚举保留字面量集合
const wrongEnum: QueryCondition<S> = {
  kind: "condition",
  id: "1",
  field: "status",
  operator: "eq",
  value: "deleted",
};
// @ts-expect-error 已应用树不允许空组
const emptyGroup: QueryGroup<S> = { kind: "group", id: "1", operator: "and", children: [] };

type CustomerConfig = CrudConfig<
  CustomerRecord,
  CustomerRecord,
  CustomerFormModel,
  string,
  S,
  { organizationId: string },
  CustomerQueryParams,
  CustomerSavePayload,
  CustomerSavePayload & { version: number },
  CustomerRecord,
  CustomerPageContext
>;
// 真实 DTO 区分列表、表单、创建、含版本更新；回调声明仅作为组合证明。
declare const customerList: NonNullable<CustomerConfig["list"]>;
declare const customerForm: NonNullable<CustomerConfig["form"]>;
declare const customerDetail: NonNullable<CustomerConfig["detail"]>;
const customerConfig: CustomerConfig = {
  key: "customer",
  list: customerList,
  form: customerForm,
  detail: customerDetail,
  navigation: {
    edit: async (id: string) => {
      void id;
    },
  },
};
type FeeFormConfig = CrudFormConfig<
  FeeFormModel,
  FeeItem,
  string,
  FeeSavePayload,
  FeeSavePayload & { version: number },
  FeeSaveResult,
  FeePageContext
>;
declare const feeForm: FeeFormConfig;
declare const feeLoad: FeeFormConfig["load"];
const resolveFee: FeeFormConfig["resolveSaved"] = async (receipt, input) =>
  feeLoad(receipt.id, input);
const resolvedFeeForm: FeeFormConfig = { ...feeForm, resolveSaved: resolveFee };
// @ts-expect-error 费用保存回执不是完整详情
const wrongReceipt: FeeFormConfig["resolveSaved"] = async (receipt) => receipt;
// @ts-expect-error 创建接口不能返回费用回执充当客户实体
const wrongSave: NonNullable<CustomerConfig["form"]>["create"] = async () => ({
  id: "1",
  billCode: "F1",
  version: 1,
});
// @ts-expect-error 更新 DTO 必须带版本
const missingVersion: Parameters<NonNullable<CustomerConfig["form"]>["update"]>[1] =
  {} as CustomerSavePayload;
const wrongNavigation: CustomerConfig["navigation"] = {
  // @ts-expect-error ID 合同不允许数字导航参数
  edit: async (id: number) => {
    void id;
  },
};
const action: CrudAction<CustomerRecord, string, CustomerPageContext> = {
  key: "approve",
  label: "审核",
  location: "row",
  execute: async ({ row, rowKey }) => {
    void row.version;
    return { affectedKeys: [rowKey] };
  },
};
const toolbar: CrudAction<CustomerRecord, string, CustomerPageContext> = {
  key: "bulk",
  label: "批量",
  location: "toolbar",
  execute: async (context) => {
    // @ts-expect-error 工具栏上下文没有当前行
    void context.row;
    return { affectedKeys: context.selectedKeys };
  },
};
const wrongAction: CrudAction<CustomerRecord, string, CustomerPageContext> = {
  key: "delete",
  label: "删除",
  location: "row",
  // @ts-expect-error 动作的结果 ID 不能变类型
  execute: async () => ({ affectedKeys: [1] }),
};
const fields: CrudOptionField<CustomerFormModel> = {
  key: "customerType",
  label: "类型",
  type: "select",
  options: [{ label: "医院", value: "hospital" }],
};
// @ts-expect-error 选项不能引入字段不接受的值
const wrongOption: CrudOptionField<CustomerFormModel> = {
  key: "customerType",
  label: "类型",
  type: "select",
  options: [{ label: "无效", value: "missing" }],
};
const formSlots: CrudFormSlots<CustomerFormModel, CustomerRecord, string> = {
  "field-customerName": ({ value, update, model }) => {
    update(value.trim());
    // @ts-expect-error 字段受控动作保留输入类型
    update(1);
    // @ts-expect-error 嵌套数据也是只读快照
    model.contacts.push({});
    return value;
  },
};
const listSlots: CrudListSlots<CustomerRecord, string, S> = {
  "column-active": ({ value }) => {
    // @ts-expect-error 列值跟随当前列类型
    const text: string = value;
    return String(value);
  },
};
// @ts-expect-error 未定义列不能冒充配置插槽
const wrongSlot: CrudListSlots<CustomerRecord, string, S> = { "column-missing": () => "" };
declare const contacts: CrudChildBinding<CustomerFormModel, "contacts">;
contacts.replace([]);
// @ts-expect-error 子模块回写保留子行类型
contacts.replace(["wrong"]);
void [envelope, customerConfig, resolvedFeeForm, action, toolbar, fields, formSlots, listSlots];
