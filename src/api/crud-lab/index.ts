import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type {
  CrudLabCreate,
  CrudLabEntity,
  CrudLabQuery,
  CrudLabReceipt,
  CrudLabRow,
  CrudLabUpdate,
} from "./types";
const base = "/api/v1/crud-lab";
export default {
  search(data: CrudLabQuery, signal: AbortSignal) {
    return request<unknown, PageResult<CrudLabRow>>({
      url: `${base}/search`,
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
  load(id: number, organizationId: string, signal: AbortSignal, fail = false) {
    return request<unknown, CrudLabEntity>({
      url: `${base}/${id}`,
      params: { organizationId, fail },
      signal,
      errorPresentation: "local",
    });
  },
  create(data: CrudLabCreate, organizationId: string, signal: AbortSignal) {
    return request<unknown, CrudLabReceipt>({
      url: base,
      method: "post",
      data: { ...data, organizationId },
      signal,
      errorPresentation: "local",
    });
  },
  update(id: number, data: CrudLabUpdate, organizationId: string, signal: AbortSignal) {
    return request<unknown, CrudLabReceipt>({
      url: `${base}/${id}`,
      method: "put",
      data: { ...data, organizationId },
      signal,
      errorPresentation: "local",
    });
  },
  remove(id: number, organizationId: string, signal: AbortSignal) {
    return request<unknown, void>({
      url: `${base}/${id}`,
      method: "delete",
      data: { organizationId },
      signal,
      errorPresentation: "local",
    });
  },
  confirm(id: number, organizationId: string, signal: AbortSignal) {
    return request<unknown, void>({
      url: `${base}/${id}/confirm`,
      method: "post",
      data: { organizationId },
      signal,
      errorPresentation: "local",
    });
  },
};
