import type { CustomerAction, CustomerSavePayload } from "../src/api/base/customer/types";
import { defineMock } from "./base";
import { runCustomerBatch } from "./customer-batch";
import { failure, pageResult, success } from "./pilot-document-utils";
import { createCustomerSeeds, materializeCustomer, validateCustomerPayload } from "./customer-data";
import type { CustomerSearchRequest } from "../src/api/base/customer/types";
import { customerSortKeys } from "../src/api/base/customer/query";
import { customerQuerySchema } from "./customer-query";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";

let rows = createCustomerSeeds();
let sequence = rows.length + 1;

export default defineMock([
  {
    url: "pilot/batch",
    method: ["POST"],
    body({ body }: { body: unknown }) {
      try {
        const output = runCustomerBatch(rows, body);
        rows = output.rows;
        return success(output.result);
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : "批量操作失败");
      }
    },
  },
  {
    url: "pilot/customers/search",
    method: ["POST"],
    body({ body }: { body: CustomerSearchRequest }) {
      try {
        const scope = queryScopeValue(body?.scope);
        // 现有种子全部属于 org-a；固定范围先过滤，用户 OR 永远不能扩大它。
        const scoped = scope.organizationId === "org-a" ? rows : [];
        return success(
          queryRecords(scoped, customerQuerySchema, body, {
            getKey: (row) => row.id,
            sortKeys: customerSortKeys,
            values: (row, key) =>
              key === "keyword"
                ? [row.customerCode, row.customerName, row.creditCode, row.shortName, row.phone]
                : [row[key]],
          })
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : "查询参数无效");
      }
    },
  },
  {
    url: "pilot/customers",
    method: ["GET"],
    body({ query }: { query: Record<string, unknown> }) {
      const filtered = rows.filter(
        (row) =>
          (!query.customerType || row.customerType === query.customerType) &&
          (query.active === undefined || String(row.active) === query.active)
      );
      // 列表当前不提供排序；只传已声明的查询字段给现有分页工具。
      return success(
        pageResult(
          filtered,
          {
            keyword: query.keyword,
            status: query.status,
            pageNum: query.pageNum,
            pageSize: query.pageSize,
          },
          (row) => `${row.customerName} ${row.customerCode} ${row.creditCode}`
        )
      );
    },
  },
  {
    url: "pilot/customers",
    method: ["POST"],
    body({ body }: { body: CustomerSavePayload }) {
      const error = validateCustomerPayload(body);
      if (error) return failure(error);
      if (body.creditCode && rows.some((row) => row.creditCode === body.creditCode))
        return failure("统一社会信用代码已存在，请检查是否重复建档");
      const number = sequence++;
      const row = materializeCustomer(
        body,
        `customer-${String(number).padStart(3, "0")}`,
        `KH${String(number).padStart(6, "0")}`
      );
      rows.unshift(row);
      return success(row);
    },
  },
  {
    url: "pilot/customers/:id",
    method: ["GET"],
    body({ params }: { params: { id: string } }) {
      const row = rows.find((item) => item.id === params.id);
      return row ? success(row) : failure("客户不存在或已被删除");
    },
  },
  {
    url: "pilot/customers/:id",
    method: ["PUT"],
    body({
      params,
      body,
    }: {
      params: { id: string };
      body: CustomerSavePayload & { version: number };
    }) {
      const row = rows.find((item) => item.id === params.id);
      if (!row) return failure("客户不存在或已被删除");
      if (row.version !== body?.version) return failure("客户资料已更新，请重新载入后编辑");
      if (row.status === "approved") return failure("请先撤销审核，再编辑客户资料");
      const error = validateCustomerPayload(body);
      if (error) return failure(error);
      if (
        body.creditCode &&
        rows.some((item) => item.id !== row.id && item.creditCode === body.creditCode)
      )
        return failure("统一社会信用代码已存在，请检查是否重复建档");
      const next = materializeCustomer(body, row.id, row.customerCode, row);
      rows = rows.map((item) => (item.id === row.id ? next : item));
      return success(next);
    },
  },
  {
    url: "pilot/customers/:id/actions",
    method: ["POST"],
    body({
      params,
      body,
    }: {
      params: { id: string };
      body: { action: CustomerAction; version: number };
    }) {
      const row = rows.find((item) => item.id === params.id);
      if (!row) return failure("客户不存在或已被删除");
      if (row.version !== body?.version) return failure("客户状态已变更，请刷新后重试");
      if (body.action === "approve") row.status = "approved";
      else if (body.action === "revoke") row.status = "pending";
      else if (body.action === "enable") row.active = true;
      else if (body.action === "disable") row.active = false;
      else return failure("不支持的客户操作");
      row.version++;
      row.updatedTime = new Date().toISOString();
      return success(row);
    },
  },
  {
    url: "pilot/customers/:id",
    method: ["DELETE"],
    body({ params, body }: { params: { id: string }; body: { version: number } }) {
      const row = rows.find((item) => item.id === params.id);
      if (!row) return failure("客户不存在或已被删除");
      if (row.version !== body?.version) return failure("客户已更新，请刷新后重试");
      if (row.status === "approved") return failure("已审核客户不能直接删除，请先撤销审核");
      rows = rows.filter((item) => item.id !== row.id);
      return success(null);
    },
  },
]);
