import { defineMock } from "./base";
import { failure, success } from "./pilot-document-utils";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";
import { queryLabSchema } from "../src/api/query-lab/query";
import type { QueryLabRecord, QueryLabSearchRequest } from "../src/api/query-lab/types";

export const queryLabRows: QueryLabRecord[] = (["org-a", "org-b"] as const).flatMap(
  (organizationId, group) =>
    Array.from({ length: 40 }, (_, index) => ({
      id: group * 100 + index,
      organizationId,
      name: `${index % 2 === 0 ? "Alpha" : "Beta"} ${String(index).padStart(2, "0")}`,
      gender: (["0", "1", "2"] as const)[index % 3]!,
      active: index % 2 === 0,
      billDate: `2026-09-${String((index % 20) + 1).padStart(2, "0")}`,
      amount: index === 0 ? "9007199254740993.01" : index === 1 ? "0.00" : `${index * 10}.10`,
      customerId: index % 3,
      email: index % 4 === 0 ? "" : `person${index}@example.com`,
    }))
);
export default defineMock([
  {
    url: "query-lab/search",
    method: ["POST"],
    async body({ body }: { body: QueryLabSearchRequest }) {
      try {
        const scope = queryScopeValue(body?.scope);
        if (body.delayMs)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(1500, Math.max(0, body.delayMs!)))
          );
        if (body.fail) return failure("实验查询失败，可关闭故障后重试");
        const scoped = queryLabRows.filter(
          (row) =>
            row.organizationId === scope.organizationId &&
            (scope.customerId === null || row.customerId === scope.customerId)
        );
        return success(
          queryRecords(scoped, queryLabSchema, body, {
            getKey: (row) => row.id,
            sortKeys: ["id", "name", "amount", "billDate"],
            values: (row, key) => [row[key]],
          })
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : "查询无效");
      }
    },
  },
]);
