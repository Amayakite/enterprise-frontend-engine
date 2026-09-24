import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type {
  CustomerAction,
  CustomerSaleChange,
  CustomerQueryParams,
  CustomerRecord,
  CustomerSavePayload,
  CustomerSearchRequest,
} from "./types";

const base = "/api/v1/pilot/customers";

export default {
  /** 一次提交多位客户各自的销售组织；当前为开发 Mock，整批校验后写入。 */
  changeSales(items: CustomerSaleChange[], organizationId: string) {
    return request<unknown, CustomerRecord[]>({
      url: `${base}/sales`,
      method: "post",
      data: { items, organizationId },
      errorPresentation: "local",
    });
  },
  search(data: CustomerSearchRequest, signal?: AbortSignal) {
    return request<unknown, PageResult<CustomerRecord>>({
      url: `${base}/search`,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  getPage(params: CustomerQueryParams) {
    return request<unknown, PageResult<CustomerRecord>>({ url: base, params });
  },
  getDetail(id: string, signal?: AbortSignal) {
    return request<unknown, CustomerRecord>({
      url: `${base}/${encodeURIComponent(id)}`,
      signal,
      errorPresentation: "local",
    });
  },
  create(data: CustomerSavePayload, signal?: AbortSignal) {
    return request<unknown, CustomerRecord>({
      url: base,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  update(id: string, data: CustomerSavePayload, version: number, signal?: AbortSignal) {
    return request<unknown, CustomerRecord>({
      url: `${base}/${encodeURIComponent(id)}`,
      method: "put",
      data: { ...data, version },
      signal,
      errorPresentation: "local",
    });
  },
  action(id: string, action: CustomerAction, version: number, signal?: AbortSignal) {
    return request<unknown, CustomerRecord>({
      url: `${base}/${encodeURIComponent(id)}/actions`,
      method: "post",
      data: { action, version },
      signal,
      errorPresentation: "local",
    });
  },
  remove(id: string, version: number, signal?: AbortSignal) {
    return request<unknown, null>({
      url: `${base}/${encodeURIComponent(id)}`,
      method: "delete",
      data: { version },
      signal,
      errorPresentation: "local",
    });
  },
};
