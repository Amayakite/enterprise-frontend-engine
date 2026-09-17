import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type { QueryLabRecord, QueryLabSearchRequest } from "./types";
export default {
  search(data: QueryLabSearchRequest, signal: AbortSignal) {
    return request<unknown, PageResult<QueryLabRecord>>({
      url: "/api/v1/query-lab/search",
      method: "post",
      data,
      signal,
      errorPresentation: "local",
    });
  },
};
