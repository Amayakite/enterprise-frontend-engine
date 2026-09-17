import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import { checkQuerySort } from "@/components/business/search/model";
import type { CustomerQueryScope, CustomerSearchRequest } from "./types";

/** 服务端允许的排序列；不由界面可见字段推断服务端能力。 */
export const customerSortKeys = ["customerCode", "customerName", "createdTime"] as const;

/**
 * 将公共查询请求适配为客户 search DTO；不维护查询 UI 字段。
 * @remarks where 由公共字段查询编译器生成并校验，后端仍需独立验证字段、权限和值。
 */
export function toCustomerSearchRequest(
  query: QueryPageRequest<QuerySchema, CustomerQueryScope>
): CustomerSearchRequest {
  return { ...query, sort: checkQuerySort(query.sort, customerSortKeys) };
}
