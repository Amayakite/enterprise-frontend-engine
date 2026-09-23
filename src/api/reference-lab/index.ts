import {
  checkReferencePage,
  checkReferenceResolve,
} from "@/components/business/MyReference/contract";
import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type {
  ReferenceFilters,
  ReferenceId,
  ReferenceQuery,
  ReferenceRequestContext,
  ReferenceResolveResult,
} from "@/components/business/MyReference/types";
import type {
  Customer,
  Contact,
  Product,
  OrganizationFilters,
  ContactFilters,
  LabControls,
} from "./types";

// 路径明确为实验 Mock 协议，不作为生产后端地址。
function createLabApi<Row, Id extends ReferenceId, F extends ReferenceFilters>(
  source: string,
  getKey: (row: Readonly<Row>) => Id
) {
  const url = `/api/v1/lab/references/${source}`;
  return {
    async search(
      query: ReferenceQuery<F>,
      context: ReferenceRequestContext,
      controls?: LabControls
    ) {
      const result = await request<unknown, PageResult<Row>>({
        url: `${url}/search`,
        method: "post",
        data: { query, controls },
        signal: context.signal,
        errorPresentation: "local",
      });
      return checkReferencePage(result, getKey, query.pageSize);
    },
    async resolve(
      ids: readonly Id[],
      filters: F,
      context: ReferenceRequestContext,
      controls?: LabControls
    ) {
      const result: ReferenceResolveResult<Row, Id> = { items: [], unavailableIds: [] };
      // Mock 单次最多 100 项；组件仍使用一次批量 source.resolve 接口约定。
      for (let offset = 0; offset < ids.length; offset += 400) {
        context.signal.throwIfAborted();
        const batches: (readonly Id[])[] = [];
        for (let start = offset; start < Math.min(offset + 400, ids.length); start += 100)
          batches.push(ids.slice(start, start + 100));
        const pages = await Promise.all(
          batches.map(async (batch) => {
            const page = await request<unknown, ReferenceResolveResult<Row, Id>>({
              url: `${url}/resolve`,
              method: "post",
              data: { ids: batch, filters, controls },
              signal: context.signal,
              errorPresentation: "local",
            });
            return checkReferenceResolve(page, batch, getKey);
          })
        );
        for (const page of pages) {
          result.items.push(...page.items);
          result.unavailableIds.push(...page.unavailableIds);
        }
      }
      return checkReferenceResolve(result, ids, getKey);
    },
  };
}

export const CustomerLabAPI = createLabApi<Customer, number, OrganizationFilters>(
  "customers",
  (row) => row.id
);
export const ContactLabAPI = createLabApi<Contact, string, ContactFilters>(
  "contacts",
  (row) => row.id
);
export const ProductLabAPI = createLabApi<Product, string, OrganizationFilters>(
  "products",
  (row) => row.id
);
