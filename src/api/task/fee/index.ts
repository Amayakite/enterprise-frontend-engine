import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type {
  FeeActionPayload,
  FeeActionResult,
  FeeItem,
  FeeQueryParams,
  FeeSavePayload,
  FeeSaveResult,
  FeeSearchRequest,
} from "./types";

// 前端先行临时接口约定；真实后端 URL 和 DTO 由本模块统一适配。
const BASE_URL = "/api/v1/pilot/task-fees";

const FeeAPI = {
  search(data: FeeSearchRequest, signal?: AbortSignal) {
    return request<unknown, PageResult<FeeItem>>({
      url: `${BASE_URL}/search`,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  getPage(params: FeeQueryParams) {
    return request<unknown, PageResult<FeeItem>>({ url: BASE_URL, method: "get", params });
  },
  getDetail(id: string, signal?: AbortSignal) {
    return request<unknown, FeeItem>({
      url: `${BASE_URL}/${encodeURIComponent(id)}`,
      method: "get",
      signal,
      errorPresentation: "local",
    });
  },
  create(data: FeeSavePayload, signal?: AbortSignal) {
    return request<unknown, FeeSaveResult>({
      url: BASE_URL,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  update(id: string, data: FeeSavePayload & { version: number }, signal?: AbortSignal) {
    return request<unknown, FeeSaveResult>({
      url: `${BASE_URL}/${encodeURIComponent(id)}`,
      method: "put",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  remove(ids: string[], signal?: AbortSignal) {
    return request<unknown, FeeActionResult>({
      url: `${BASE_URL}/remove`,
      method: "post",
      data: { ids },
      signal,
      errorPresentation: "local",
    });
  },
  approve(data: FeeActionPayload, signal?: AbortSignal) {
    return request<unknown, FeeActionResult>({
      url: `${BASE_URL}/approve`,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  revoke(data: FeeActionPayload, signal?: AbortSignal) {
    return request<unknown, FeeActionResult>({
      url: `${BASE_URL}/revoke`,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
};

export default FeeAPI;
export * from "./types";
