import { defineMock } from "./base";
import { cloneMock, failure, success } from "./pilot-document-utils";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";
import { toFixedDecimal } from "../src/utils/decimal";
import { crudLabSchema } from "../src/api/crud-lab/query";
import type {
  CrudLabCreate,
  CrudLabEntity,
  CrudLabQuery,
  CrudLabUpdate,
} from "../src/api/crud-lab/types";

// 开发服务进程内的实验数据；重启会重置，不代表正式持久化协议。
export const crudLabEntities: CrudLabEntity[] = Array.from({ length: 21 }, (_, id) => ({
  id,
  code: `LAB-${String(id).padStart(3, "0")}`,
  title: `装配样例 ${String(id).padStart(2, "0")}`,
  organizationId: "org-a",
  billDate: "2026-09-10",
  amount: `${id}.10`,
  category: id % 2 ? "urgent" : "regular",
  status: "draft",
  version: 1,
  note: "",
  lines: Array.from({ length: id === 0 ? 12 : 1 }, (_, line) => ({
    id: `${id}-${line}`,
    name: `明细 ${line + 1}`,
    quantity: 1,
  })),
}));
let nextId = 21;
function locate(id: unknown, organizationId: unknown) {
  return crudLabEntities.find(
    (row) => row.id === Number(id) && row.organizationId === organizationId
  );
}
function validate(data: CrudLabCreate) {
  if (!data.title?.trim()) throw new Error("名称不能为空");
  if (
    !Array.isArray(data.lines) ||
    !data.lines.length ||
    data.lines.some(
      (row) => !row.name?.trim() || !Number.isFinite(row.quantity) || row.quantity <= 0
    )
  )
    throw new Error("明细名称、数量无效");
  toFixedDecimal(data.amount);
}
export default defineMock([
  {
    url: "crud-lab/search",
    method: ["POST"],
    async body({ body }: { body: CrudLabQuery }) {
      try {
        if (body.delayMs)
          await new Promise((resolve) => setTimeout(resolve, Math.min(1500, body.delayMs!)));
        if (body.fail) return failure("实验列表读取失败");
        const scope = queryScopeValue(body.scope);
        return success(
          queryRecords(
            crudLabEntities.filter((row) => row.organizationId === scope.organizationId),
            crudLabSchema,
            body,
            {
              getKey: (row) => row.id,
              sortKeys: ["id", "code", "title", "billDate", "amount", "category", "status"],
              values: (row, key) => [row[key]],
            }
          )
        );
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : "查询失败");
      }
    },
  },
  {
    url: "crud-lab/:id",
    method: ["GET"],
    body({ params, query }) {
      if (query.fail === "true") return failure("实验详情回填失败");
      const entity = locate(params.id, query.organizationId);
      return entity ? success(entity) : failure("记录不存在或不在当前组织范围");
    },
  },
  {
    url: "crud-lab",
    method: ["POST"],
    body({ body }: { body: CrudLabCreate & { organizationId: string } }) {
      try {
        validate(body);
        const id = nextId++;
        const entity: CrudLabEntity = {
          ...cloneMock(body),
          title: body.title.trim(),
          amount: toFixedDecimal(body.amount),
          id,
          code: `LAB-${String(id).padStart(3, "0")}`,
          version: 1,
          status: "draft",
        };
        crudLabEntities.push(entity);
        return success({ id, version: entity.version });
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : "保存失败");
      }
    },
  },
  {
    url: "crud-lab/:id",
    method: ["PUT"],
    body({
      params,
      body,
    }: {
      params: { id: string };
      body: CrudLabUpdate & { organizationId: string };
    }) {
      try {
        const current = locate(params.id, body.organizationId);
        if (!current || current.version !== body.version || current.status !== "draft")
          return failure("记录不存在、已被修改或不可编辑");
        validate(body);
        Object.assign(current, cloneMock(body), {
          title: body.title.trim(),
          amount: toFixedDecimal(body.amount),
          version: current.version + 1,
        });
        return success({ id: current.id, version: current.version });
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : "保存失败");
      }
    },
  },
  {
    url: "crud-lab/:id",
    method: ["DELETE"],
    body({ params, body }) {
      const current = locate(params.id, body?.organizationId);
      if (!current) return failure("记录不存在");
      crudLabEntities.splice(crudLabEntities.indexOf(current), 1);
      return success(null);
    },
  },
  {
    url: "crud-lab/:id/confirm",
    method: ["POST"],
    body({ params, body }) {
      const current = locate(params.id, body?.organizationId);
      if (!current || current.status !== "draft") return failure("当前记录不能确认");
      current.status = "confirmed";
      current.version++;
      return success(null);
    },
  },
]);
