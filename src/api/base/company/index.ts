import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type { CompanyPayload, CompanyRecord, CompanySearchRequest, CompanyUpdate } from "./types";
const base = "/api/v1/pilot/companies";
/** Company 的传输边界；请求透传取消信号，错误由页面局部显示。 */
export default {
  /** 按固定范围、AST 与分页读取；不在客户端扫描数据。 */
  search(data: CompanySearchRequest, signal?: AbortSignal) {
    return request<unknown, PageResult<CompanyRecord>>({
      url: base + "/search",
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  /** 读取一条记录，失败不当作空模型。 */
  detail(id: string, signal?: AbortSignal) {
    return request<unknown, CompanyRecord>({
      url: base + "/" + encodeURIComponent(id),
      signal,
      errorPresentation: "local",
    });
  },
  /** 创建一次；Mock 仅开发进程内保留。 */
  create(data: CompanyPayload, signal?: AbortSignal) {
    return request<unknown, CompanyRecord>({
      url: base,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  /** 更新一次；版本来自原实体，不能盲目重试。 */
  update(id: string, data: CompanyUpdate, signal?: AbortSignal) {
    return request<unknown, CompanyRecord>({
      url: base + "/" + encodeURIComponent(id),
      method: "put",
      data,
      signal,
      errorPresentation: "local",
    });
  },
};
