import type { CustomerRecord } from "../src/api/base/customer/types";
import type { BatchResult } from "../src/api/common/batch";
import { customerQuerySchema } from "./customer-query";
import { parseQueryWhere } from "../src/components/business/search/model";
import { evaluateQuery } from "../src/components/business/search/evaluate";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
 * 开发 Mock 的统一批量处理，query 模式不分页；真实后端必须自行鉴权/限定范围。
 * @remarks 不声称事务或幂等。返回有限失败样本，不能由前端循环单条请求替代。
 */
export function runCustomerBatch(rows: CustomerRecord[], body: unknown) {
  if (
    !object(body) ||
    body.componentKey !== "customer" ||
    !["delete", "disable"].includes(String(body.action)) ||
    typeof body.requestId !== "string" ||
    !body.requestId.trim() ||
    !object(body.target)
  )
    throw new Error("批量请求不合法");
  const target = body.target;
  let selected: { key: string | number; row: CustomerRecord | undefined }[];
  if (target.mode === "selected") {
    const byCode = Object.hasOwn(target, "batchCode");
    if (byCode === Object.hasOwn(target, "batchID"))
      throw new Error("必须且只能传 batchID 或 batchCode");
    const values = byCode ? target.batchCode : target.batchID;
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.length > 100 ||
      values.some((x) => typeof x !== "string" || !x.trim()) ||
      new Set(values).size !== values.length
    )
      throw new Error("批量标识不合法");
    selected = values.map((key: string) => ({
      key,
      row: rows.find((row) => (byCode ? row.customerCode : row.id) === key),
    }));
  } else if (target.mode === "query") {
    if (!object(target.query) || !object(target.query.scope)) throw new Error("缺少固定查询范围");
    const scope = object(target.query.scope.value) ? target.query.scope.value : target.query.scope;
    if (scope.organizationId !== "org-a") throw new Error("不支持的组织范围");
    const parsed = parseQueryWhere(customerQuerySchema, target.query.where);
    if (!parsed.valid) throw new Error("查询条件不合法");
    selected = rows
      .filter((row) =>
        evaluateQuery(customerQuerySchema, parsed.where, (key) =>
          key === "keyword"
            ? [row.customerCode, row.customerName, row.creditCode, row.shortName, row.phone]
            : [row[key]]
        )
      )
      .map((row) => ({ key: row.id, row }));
  } else throw new Error("未知批量目标模式");
  const failures: { key: string | number; message: string }[] = [];
  const deleted = new Set<string>();
  let succeeded = 0,
    failed = 0;
  for (const { row, key } of selected) {
    const reason = !row
      ? "记录不存在或已删除"
      : body.action === "delete" && row.status === "approved"
        ? "已审核客户须先撤销审核"
        : undefined;
    if (reason || !row) {
      failed++;
      if (failures.length < 50) failures.push({ key, message: reason ?? "记录不存在" });
      continue;
    }
    if (body.action === "delete") deleted.add(row.id);
    else {
      row.active = false;
      row.version++;
      row.updatedTime = new Date().toISOString();
    }
    succeeded++;
  }
  const result: BatchResult = {
    requestId: body.requestId,
    matched: selected.length,
    succeeded,
    failed,
    failures,
  };
  return { rows: rows.filter((row) => !deleted.has(row.id)), result };
}
