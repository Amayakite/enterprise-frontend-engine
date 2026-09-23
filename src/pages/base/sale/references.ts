import SaleAPI from "@/api/base/sale";
import type { SaleRecord, SaleScope } from "@/api/base/sale/types";
import type { ReferenceSource } from "@/components/business/MyReference/types";
import { saleModule } from "./config";
import { checkQuerySort } from "@/components/business/search/model";
const list = saleModule.createViewConfig({}).list;
/** 复用 Sale 的查询字段与关键词展开；导航由使用它的字段配置决定。 */
export const saleReference: ReferenceSource<SaleRecord, string, SaleScope> = {
  key: "base.sale",
  title: "销售组织",
  getKey: (row) => row.id,
  getLabel: (row) => row.name,
  getDescription: (row) => row.code,
  columns: [
    { key: "code", label: "组织编码", width: 150 },
    { key: "name", label: "组织名称", minWidth: 200 },
  ],
  query: {
    schema: list.query.schema,
    request: (query, context) =>
      SaleAPI.search(
        list.toQuery(
          { ...query, sort: checkQuerySort(query.sort, ["code", "name"]) },
          { ...query.scope.value, scopeKey: query.scope.key }
        ),
        context.signal
      ),
  },
  search: (query, context) =>
    SaleAPI.search(
      {
        scope: { key: query.filters.organizationId, value: query.filters },
        where: query.keyword.trim()
          ? {
              kind: "group",
              id: "suggest",
              operator: "or",
              children: [
                {
                  kind: "condition",
                  id: "code",
                  field: "code",
                  operator: "contains",
                  value: query.keyword.trim(),
                },
                {
                  kind: "condition",
                  id: "name",
                  field: "name",
                  operator: "contains",
                  value: query.keyword.trim(),
                },
              ],
            }
          : null,
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        sort: null,
      },
      context.signal
    ),
  resolve: (ids, filters, context) => SaleAPI.resolve(ids, filters, context.signal),
  selectable: (row) => ({ allowed: row.active, reason: row.active ? undefined : "销售组织已停用" }),
};
