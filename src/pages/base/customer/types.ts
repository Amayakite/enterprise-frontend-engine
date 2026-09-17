import type {
  CustomerRecord,
  CustomerSavePayload,
  CustomerUpdatePayload,
  CustomerSearchRequest,
  CustomerQueryScope,
} from "@/api/base/customer/types";
import type { QuerySchema } from "@/components/business/search/types";
import type { BusinessModuleContract } from "@/components/business/crud/module";

/**
 * 客户统一页面模型：列表/详情共享展示字段，编辑态允许地区 ID 为 null。
 * @remarks 审计字段仅回显；草稿及保存均使用白名单，不直接提交此对象。
 */
export interface CustomerFormModel extends Omit<
  CustomerRecord,
  "provinceId" | "cityId" | "districtId" | "saleId"
> {
  /** 未选择销售组织时为 null，保存前必填校验。 */
  saleId: string | null;
  provinceId: string | null;
  cityId: string | null;
  districtId: string | null;
}

export interface CustomerPageContext {
  /** 开发 Mock 的固定组织；正式组织切换需由登录上下文提供。 */
  organizationId: "org-a";
  /** 用户/组织/权限隔离后的可读范围 key，用于查询与参照请求隔离。 */
  scopeKey: string;
}

/**
 * 客户对公共模块合同的具体化；不是另一套框架类型，不产生运行时对象。
 * @remarks 放在页面 types.ts，由 config 引用；API DTO 仍归 API 目录。
 * @see BusinessModuleContract
 */
export interface CustomerContract extends BusinessModuleContract {
  /** 字段所用的客户视图模型；地区 ID 可空，含只读展示属性。 */
  Model: CustomerFormModel;
  /** 详情与保存回填的 API 实体，保留服务端 version。 */
  Entity: CustomerRecord;
  /** 当前客户 API 的主键是字符串，不能强转为数字。 */
  Id: string;
  /** fields 模式的运行时 schema；字段配置自身约束 key、控件及允许覆盖的操作符。 */
  Schema: QuerySchema;
  /** 后端不可由用户条件覆盖的组织范围。 */
  Scope: CustomerQueryScope;
  /** 列表 search 接口接受的分页/排序/查询 DTO。 */
  Query: CustomerSearchRequest;
  /** 新增整单请求，包含 contacts/addresses 数组。 */
  Create: CustomerSavePayload;
  /** 编辑整单请求，在新增白名单上增加版本号。 */
  Update: CustomerUpdatePayload;
  /** 当前 Mock 保存直接返回实体；不是所有后端都如此。 */
  Result: CustomerRecord;
  /** 页面固定组织和访问范围。 */
  Context: CustomerPageContext;
}
