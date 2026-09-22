import { defineMock } from "./base";
import { success, failure } from "./pilot-document-utils";
import { saleRows, salePayload } from "./sale-data";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";
import { FIELD_QUERY_OPERATORS } from "../src/components/business/crud/field-query";
import type { QuerySchema } from "../src/components/business/search/types";
import type {
  SalePayload,
  SaleSearchRequest,
  SaleUpdate,
  SaleScope,
} from "../src/api/base/sale/types";
/** 服务端独立白名单，不供页面生成 UI。 */
const schema = {
  code: {
    label: "编码",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  name: {
    label: "名称",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.text,
  },
  active: {
    label: "启用",
    kind: "boolean",
    entries: ["normal", "advanced"],
    operators: FIELD_QUERY_OPERATORS.boolean,
  },
} as const satisfies QuerySchema;
export default defineMock([
  {
    url: "pilot/sales/search",
    method: ["POST"],
    body({ body }: { body: SaleSearchRequest }) {
      try {
        const scope = queryScopeValue(body.scope);
        return success(
          queryRecords(
            saleRows.filter((row) => row.organizationId === scope.organizationId),
            schema,
            body,
            {
              getKey: (row) => row.id,
              sortKeys: ["code", "name"],
              values: (row, key) => [row[key]],
            }
          )
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : "查询失败");
      }
    },
  },
  {
    url: "pilot/sales/resolve",
    method: ["POST"],
    body({ body }: { body: { ids: string[]; filters: SaleScope } }) {
      if (
        !Array.isArray(body.ids) ||
        body.ids.some((id) => typeof id !== "string") ||
        body.ids.length > 500
      )
        return failure("参照 ID 参数无效");
      const items = saleRows.filter(
        (row) => body.ids.includes(row.id) && row.organizationId === body.filters?.organizationId
      );
      return success({
        items,
        unavailableIds: body.ids.filter((id) => !items.some((row) => row.id === id)),
      });
    },
  },
  {
    url: "pilot/sales/:id",
    method: ["GET"],
    body({ params }: { params: { id: string } }) {
      const row = saleRows.find((item) => item.id === params.id && item.organizationId === "org-a");
      return row ? success(row) : failure("销售组织不存在或无权查看");
    },
  },
  {
    url: "pilot/sales",
    method: ["POST"],
    body({ body }: { body: SalePayload }) {
      try {
        const payload = salePayload(body);
        if (saleRows.some((row) => row.code === payload.code)) return failure("组织编码已存在");
        const row = {
          ...payload,
          id: `sale-new-${crypto.randomUUID()}`,
          organizationId: "org-a",
          version: 0,
        };
        saleRows.push(row);
        return success(row);
      } catch (error) {
        return failure(error instanceof Error ? error.message : "保存失败");
      }
    },
  },
  {
    url: "pilot/sales/:id",
    method: ["PUT"],
    body({ params, body }: { params: { id: string }; body: SaleUpdate }) {
      try {
        const index = saleRows.findIndex(
          (row) => row.id === params.id && row.organizationId === "org-a"
        );
        if (index < 0) return failure("销售组织不存在或无权修改");
        const previous = saleRows[index]!;
        if (body.version !== previous.version) return failure("记录已更新，请重新打开");
        const payload = salePayload(body);
        if (saleRows.some((row) => row.id !== params.id && row.code === payload.code))
          return failure("组织编码已存在");
        const row = { ...previous, ...payload, version: previous.version + 1 };
        saleRows[index] = row;
        return success(row);
      } catch (error) {
        return failure(error instanceof Error ? error.message : "保存失败");
      }
    },
  },
]);
