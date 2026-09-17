import request from "@/utils/request";
import { masterQuerySchema } from "./query";
import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import {
  checkReferencePage,
  checkReferenceResolve,
} from "@/components/business/MyReference/contract";
import type { PageResult } from "@/types/http";
import type {
  ReferenceFilters,
  ReferenceId,
  ReferenceQuery,
  ReferenceRequestContext,
  ReferenceResolveResult,
} from "@/components/business/MyReference/types";

// `/pilot` 是前端先行 Mock 命名空间，真实后端 URL 在联调时只从本模块替换。
export function createMasterDataApi<Row, Id extends ReferenceId, F extends ReferenceFilters>(
  source: string,
  getKey: (row: Readonly<Row>) => Id
) {
  const url = `/api/v1/pilot/master-data/${source}`;
  const schema = masterQuerySchema(source);
  return {
    query: schema
      ? {
          schema,
          async request(query: QueryPageRequest<QuerySchema, F>, context: ReferenceRequestContext) {
            const result = await request<unknown, PageResult<Row>>({
              url: `${url}/query`,
              method: "post",
              data: query,
              signal: context.signal,
              errorPresentation: "local",
            });
            return checkReferencePage(result, getKey, query.pageSize);
          },
        }
      : undefined,
    async search(query: ReferenceQuery<F>, context: ReferenceRequestContext) {
      const result = await request<unknown, PageResult<Row>>({
        url: `${url}/search`,
        method: "post",
        data: { query },
        signal: context.signal,
        errorPresentation: "local",
      });
      return checkReferencePage(result, getKey, query.pageSize);
    },
    async resolve(ids: readonly Id[], filters: F, context: ReferenceRequestContext) {
      const result = await request<unknown, ReferenceResolveResult<Row, Id>>({
        url: `${url}/resolve`,
        method: "post",
        data: { ids, filters },
        signal: context.signal,
        errorPresentation: "local",
      });
      return checkReferenceResolve(result, ids, getKey);
    },
  };
}

export * from "./types";
