import type { BaseQueryParams } from "@/types/http";
import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import type { customerSortKeys } from "./query";

/** 固定查询范围，由当前组织上下文提供，不属于可编辑筛选。 */
export interface CustomerQueryScope {
  /** 固定组织范围，当前 Mock 使用 org-a。 */
  organizationId: string;
}
/** 标准分页查询 DTO；排序白名单归 query.ts，界面查询字段由模块 fields 派生。 */
export interface CustomerSearchRequest extends Omit<
  QueryPageRequest<QuerySchema, CustomerQueryScope>,
  "sort"
> {
  sort: { key: (typeof customerSortKeys)[number]; order: "asc" | "desc" } | null;
}

export type CustomerType = "distributor" | "chain" | "hospital";
export type CustomerStatus = "pending" | "approved";
export type CustomerAction = "approve" | "revoke" | "enable" | "disable";

/**
 * 客户联系人子行；随客户整单保存，没有独立保存端点。
 * @remarks id 是当前 Mock 的稳定行键；正式后端的生成/映射策略待联调。
 * primary 归一化和多行校验由 children/contacts/config.ts 维护。
 */
export interface CustomerContact {
  /** 稳定字符串标识；具体生成策略以所属实体/子行接口为准。 */
  id: string;
  /** 联系人姓名。 */
  name: string;
  /** 联系人职务或部门，未填写为空字符串。 */
  position: string;
  /** 联系电话；未填写为空字符串，具体必填规则由所属字段配置决定。 */
  phone: string;
  /** 联系人邮箱，未填写为空字符串。 */
  email: string;
  /** 是否为主要联系人或默认地址；同一数组的唯一项规则归子配置。 */
  primary: boolean;
}

/** 客户收货地址子行；随整单提交，默认项与行规则归 children/addresses/config.ts。 */
export interface CustomerAddress {
  /** 稳定字符串标识；具体生成策略以所属实体/子行接口为准。 */
  id: string;
  /** 收货地址名称。 */
  label: string;
  /** 收货人姓名。 */
  recipient: string;
  /** 联系电话；未填写为空字符串，具体必填规则由所属字段配置决定。 */
  phone: string;
  /** 详细地址文本；未填写为空字符串。 */
  address: string;
  /** 是否为主要联系人或默认地址；同一数组的唯一项规则归子配置。 */
  primary: boolean;
}

/**
 * 客户整单写入白名单：主资料、销售组织 ID、地区 ID 和两个子数组。
 * @remarks 名称回显、编号、审核/启用状态及审计属性不在普通表单提交中；空子数组也提交。
 * 这是开发 Mock 的 API 结构，不代表数据库物理表；正式后端字段与子表 ID 策略待联调。
 * @see docs/customer-example.md 的“结构设计”
 */
export interface CustomerSavePayload {
  /** 客户所属销售组织；新客户必须选择。 */
  saleId: string;
  /** 客户完整名称，提交前归一化。 */
  customerName: string;
  /** 客户简称，未填写为空字符串。 */
  shortName: string;
  /** 客户业务分类，对应 CustomerType 的枚举值。 */
  customerType: CustomerType;
  /** 统一社会信用代码，选填；填写时校验格式。 */
  creditCode: string;
  /** 联系电话；未填写为空字符串，具体必填规则由所属字段配置决定。 */
  phone: string;
  /** 省份 ID；DTO 使用字符串，页面未选择时的 null 需经 adapter 处理。 */
  provinceId: string;
  /** 城市 ID，受省份约束。 */
  cityId: string;
  /** 区县 ID，受城市约束。 */
  districtId: string;
  /** 详细地址文本；未填写为空字符串。 */
  address: string;
  /** 业务备注，未填写为空字符串。 */
  remark: string;
  /** 完整联系人数组；空数组表示本次整单无联系人。 */
  contacts: CustomerContact[];
  /** 完整收货地址数组；空数组表示本次整单无地址。 */
  addresses: CustomerAddress[];
}

/** 编辑整单时同时携带乐观锁版本；主子行请求字段与新增一致。 */
export type CustomerUpdatePayload = CustomerSavePayload & {
  /** 载入时的主实体版本，不能从旧草稿覆盖。 */
  version: number;
};

/** 读取/保存回填实体；在写入字段上补充接口生成的 ID、名称、状态、审计与版本。 */
export interface CustomerRecord extends CustomerSavePayload {
  /** 后端解析的销售组织名称，不作为写入字段。 */
  saleName: string;
  /** 稳定字符串标识；具体生成策略以所属实体/子行接口为准。 */
  id: string;
  /** 接口生成的客户编号，仅展示。 */
  customerCode: string;
  /** 接口返回的省份展示名称，不作为写入字段。 */
  provinceName: string;
  /** 接口返回的城市展示名称，不作为写入字段。 */
  cityName: string;
  /** 接口返回的区县展示名称，不作为写入字段。 */
  districtName: string;
  /** 审核状态；通过对应业务动作变更。 */
  status: CustomerStatus;
  /** 是否启用；通过启用/停用动作变更。 */
  active: boolean;
  /** 创建人展示名称，只读。 */
  createdBy: string;
  /** 创建时间字符串，当前 Mock 使用 YYYY-MM-DD HH:mm:ss；正式时区待确认。 */
  createdTime: string;
  /** 更新时间字符串，格式同 createdTime。 */
  updatedTime: string;
  /** 实体基线版本，编辑必须携带载入值。 */
  version: number;
}

/** 简单分页接口的查询参数；标准 CRUD 使用 CustomerSearchRequest，不混入编辑模型。 */
export interface CustomerQueryParams extends BaseQueryParams {
  keyword?: string;
  customerType?: CustomerType;
  status?: CustomerStatus;
  active?: boolean;
}
