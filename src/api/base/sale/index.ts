import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type { ReferenceResolveResult } from "@/components/business/MyReference/types";
import type { SalePayload, SaleRecord, SaleSearchRequest, SaleUpdate, SaleScope } from "./types";
const base = "/api/v1/pilot/sales";
/** Sale 的传输边界；请求透传取消信号，错误由页面局部呈现。 */
export default {
  /** 按固定范围、AST 与分页读取；不在客户端扫描数据。 */
  search(data: SaleSearchRequest, signal?: AbortSignal) {
    return request<unknown, PageResult<SaleRecord>>({
      url: base + "/search",
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  /** 批量解析已选 ID；不可访问记录显式归入 unavailableIds。 */
  resolve(ids: readonly string[], filters: SaleScope, signal?: AbortSignal) {
    return request<unknown, ReferenceResolveResult<SaleRecord, string>>({
      url: base + "/resolve",
      method: "post",
      data: { ids, filters },
      signal,
      errorPresentation: "local",
    });
  },
  /** 读取一条记录，失败不当作空模型。 */
  detail(id: string, signal?: AbortSignal) {
    return request<unknown, SaleRecord>({
      url: base + "/" + encodeURIComponent(id),
      signal,
      errorPresentation: "local",
    });
  },
  /** 创建一次；Mock 仅开发进程内保留。 */
  create(data: SalePayload, signal?: AbortSignal) {
    return request<unknown, SaleRecord>({
      url: base,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  /** 更新一次；版本来自原实体，不能盲目重试。 */
  update(id: string, data: SaleUpdate, signal?: AbortSignal) {
    return request<unknown, SaleRecord>({
      url: base + "/" + encodeURIComponent(id),
      method: "put",
      data,
      signal,
      errorPresentation: "local",
    });
  },
};
