import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type {
  ServiceApplicationActionResult,
  ServiceApplicationItem,
  ServiceApplicationQueryParams,
  ServiceApplicationSavePayload,
  ServiceApplicationSaveResult,
} from "./types";

const BASE_URL = "/api/v1/pilot/service-applications";

const ServiceApplicationAPI = {
  getPage(params: ServiceApplicationQueryParams, signal?: AbortSignal) {
    return request<unknown, PageResult<ServiceApplicationItem>>({
      url: BASE_URL,
      method: "get",
      params,
      signal,
    });
  },
  getDetail(id: string, signal?: AbortSignal) {
    return request<unknown, ServiceApplicationItem>({
      url: `${BASE_URL}/${encodeURIComponent(id)}`,
      method: "get",
      signal,
    });
  },
  create(data: ServiceApplicationSavePayload, signal?: AbortSignal) {
    return request<unknown, ServiceApplicationSaveResult>({
      url: BASE_URL,
      method: "post",
      data,
      signal,
    });
  },
  update(
    id: string,
    data: ServiceApplicationSavePayload & { version: number },
    signal?: AbortSignal
  ) {
    return request<unknown, ServiceApplicationSaveResult>({
      url: `${BASE_URL}/${encodeURIComponent(id)}`,
      method: "put",
      data,
      signal,
    });
  },
  remove(ids: string[], signal?: AbortSignal) {
    return request<unknown, ServiceApplicationActionResult>({
      url: `${BASE_URL}/remove`,
      method: "post",
      data: { ids },
      signal,
    });
  },
  approve(ids: string[], reason?: string, signal?: AbortSignal) {
    return request<unknown, ServiceApplicationActionResult>({
      url: `${BASE_URL}/approve`,
      method: "post",
      data: { ids, reason },
      signal,
    });
  },
  revoke(ids: string[], reason?: string, signal?: AbortSignal) {
    return request<unknown, ServiceApplicationActionResult>({
      url: `${BASE_URL}/revoke`,
      method: "post",
      data: { ids, reason },
      signal,
    });
  },
};

export default ServiceApplicationAPI;
export * from "./types";
