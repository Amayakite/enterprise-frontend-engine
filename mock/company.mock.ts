import { defineMock } from "./base";
import { success, failure } from "./pilot-document-utils";
import { companyRows, companyPayload } from "./company-data";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";
import { FIELD_QUERY_OPERATORS } from "../src/components/business/crud/field-query";
import type { QuerySchema } from "../src/components/business/search/types";
import type {
  CompanyPayload,
  CompanySearchRequest,
  CompanyUpdate,
} from "../src/api/base/company/types";
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
    url: "pilot/companies/search",
    method: ["POST"],
    body({ body }: { body: CompanySearchRequest }) {
      try {
        const scope = queryScopeValue(body.scope);
        return success(
          queryRecords(
            companyRows.filter((row) => row.organizationId === scope.organizationId),
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
    url: "pilot/companies/:id",
    method: ["GET"],
    body({ params }: { params: { id: string } }) {
      const row = companyRows.find(
        (item) => item.id === params.id && item.organizationId === "org-a"
      );
      return row ? success(row) : failure("公司不存在或无权查看");
    },
  },
  {
    url: "pilot/companies",
    method: ["POST"],
    body({ body }: { body: CompanyPayload }) {
      try {
        const payload = companyPayload(body);
        if (companyRows.some((row) => row.code === payload.code)) return failure("公司编码已存在");
        const row = {
          ...payload,
          id: `company-new-${crypto.randomUUID()}`,
          organizationId: "org-a",
          version: 0,
        };
        companyRows.push(row);
        return success(row);
      } catch (error) {
        return failure(error instanceof Error ? error.message : "保存失败");
      }
    },
  },
  {
    url: "pilot/companies/:id",
    method: ["PUT"],
    body({ params, body }: { params: { id: string }; body: CompanyUpdate }) {
      try {
        const index = companyRows.findIndex(
          (row) => row.id === params.id && row.organizationId === "org-a"
        );
        if (index < 0) return failure("公司不存在或无权修改");
        const previous = companyRows[index]!;
        if (body.version !== previous.version) return failure("记录已更新，请重新打开");
        const payload = companyPayload(body);
        if (companyRows.some((row) => row.id !== params.id && row.code === payload.code))
          return failure("公司编码已存在");
        const row = { ...previous, ...payload, version: previous.version + 1 };
        companyRows[index] = row;
        return success(row);
      } catch (error) {
        return failure(error instanceof Error ? error.message : "保存失败");
      }
    },
  },
]);
