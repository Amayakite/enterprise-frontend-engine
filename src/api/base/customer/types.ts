import type { BaseQueryParams } from "@/types/http";
import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import type { customerSortKeys } from "./query";

export interface CustomerQueryScope {
  organizationId: string;
}
export interface CustomerSearchRequest extends Omit<
  QueryPageRequest<QuerySchema, CustomerQueryScope>,
  "sort"
> {
  sort: { key: (typeof customerSortKeys)[number]; order: "asc" | "desc" } | null;
}

export type CustomerType = "distributor" | "chain" | "hospital";
export type CustomerStatus = "pending" | "approved";
export type CustomerAction = "approve" | "revoke" | "enable" | "disable";

export interface CustomerContact {
  id: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  primary: boolean;
}

export interface CustomerAddress {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  address: string;
  primary: boolean;
}

/** 客户示例的整单写入合同；正式后端字段与子表 ID 策略仍需联调。 */
export interface CustomerSavePayload {
  /** 客户所属销售组织；新客户必须选择。 */
  saleId: string;
  customerName: string;
  shortName: string;
  customerType: CustomerType;
  creditCode: string;
  phone: string;
  provinceId: string;
  cityId: string;
  districtId: string;
  address: string;
  remark: string;
  contacts: CustomerContact[];
  addresses: CustomerAddress[];
}

/** 编辑整单时同时携带乐观锁版本；主子行请求字段与新增一致。 */
export type CustomerUpdatePayload = CustomerSavePayload & { version: number };

export interface CustomerRecord extends CustomerSavePayload {
  /** 后端解析的销售组织名称，不作为写入字段。 */
  saleName: string;
  id: string;
  customerCode: string;
  provinceName: string;
  cityName: string;
  districtName: string;
  status: CustomerStatus;
  active: boolean;
  createdBy: string;
  createdTime: string;
  updatedTime: string;
  version: number;
}

export interface CustomerQueryParams extends BaseQueryParams {
  keyword?: string;
  customerType?: CustomerType;
  status?: CustomerStatus;
  active?: boolean;
}
