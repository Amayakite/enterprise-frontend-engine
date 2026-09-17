import type { FeeItem, FeeSavePayload, FeeSearchRequest } from "../src/api/task/fee/types";
import { feeQuerySchema, feeSortKeys } from "../src/api/task/fee/query";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";
import { defineMock } from "./base";
import { inventory, inventoryIdsByOwnerParty, parties } from "./business-reference-data";
import { bodyIds, cloneMock, failure, pageResult, success } from "./pilot-document-utils";

let sequence = 5;
let rows: FeeItem[] = [
  createSeed(
    "fee-1",
    "FY202609001",
    "2026-09-02",
    "party-a-1",
    "party-b-1",
    "inv-1",
    "12500.00",
    "draft",
    "首轮市场服务预算"
  ),
  createSeed(
    "fee-2",
    "FY202609002",
    "2026-09-04",
    "party-a-2",
    "party-b-2",
    "inv-2",
    "28600.00",
    "approved",
    "慢病项目季度预算"
  ),
  createSeed(
    "fee-3",
    "FY202609003",
    "2026-09-06",
    "party-a-1",
    "party-b-2",
    "inv-3",
    "9800.50",
    "draft",
    "苏州终端服务预算"
  ),
  createSeed(
    "fee-4",
    "FY202609004",
    "2026-09-08",
    "party-a-2",
    "party-b-1",
    "inv-4",
    "16800.00",
    "approved",
    "零售渠道陈列预算"
  ),
];

function createSeed(
  id: string,
  billCode: string,
  billDate: string,
  principalPartyId: string,
  providerPartyId: string,
  inventoryId: string,
  amount: string,
  status: FeeItem["status"],
  remark: string
): FeeItem {
  const principal = parties.find((row) => row.id === principalPartyId)!;
  const provider = parties.find((row) => row.id === providerPartyId)!;
  const product = inventory.find((row) => row.id === inventoryId)!;
  return {
    id,
    billCode,
    billDate,
    principalPartyId,
    principalPartyName: principal.name,
    providerPartyId,
    providerPartyName: provider.name,
    inventoryId,
    inventoryName: product.name,
    businessName: product.businessName,
    factoryName: product.factoryName,
    amount,
    attachments: id === "fee-1" ? [{ name: "预算说明.pdf", url: "/pilot-files/budget.pdf" }] : [],
    remark,
    status,
    generatedTaskCodes: status === "approved" ? [`RW-${billCode.slice(-3)}`] : [],
    failureReason: "",
    createdBy: "系统管理员",
    createdTime: `${billDate} 09:30:00`,
    version: 1,
  };
}

function validate(payload: FeeSavePayload) {
  const principal = parties.find(
    (row) => row.id === payload.principalPartyId && row.active && row.role !== "provider"
  );
  const provider = parties.find(
    (row) => row.id === payload.providerPartyId && row.active && row.role !== "principal"
  );
  const product = inventory.find(
    (row) =>
      row.id === payload.inventoryId &&
      row.active &&
      inventoryIdsByOwnerParty[payload.principalPartyId]?.includes(row.id)
  );
  const amount = Number(payload.amount);
  if (!payload.billDate || !principal || !provider || !product) return "单据基础资料无效";
  if (!Number.isFinite(amount) || amount <= 0) return "预算金额必须大于 0";
  if (!/^\d+(\.\d{1,2})?$/.test(payload.amount)) return "预算金额最多保留两位小数";
  if (payload.remark.includes("保存失败")) return "已按约定模拟保存失败，页面输入应继续保留";
  return "";
}

function materialize(
  id: string,
  billCode: string,
  payload: FeeSavePayload,
  previous?: FeeItem
): FeeItem {
  const principal = parties.find((row) => row.id === payload.principalPartyId)!;
  const provider = parties.find((row) => row.id === payload.providerPartyId)!;
  const product = inventory.find((row) => row.id === payload.inventoryId)!;
  return {
    id,
    billCode,
    ...payload,
    attachments: cloneMock(payload.attachments ?? []),
    principalPartyName: principal.name,
    providerPartyName: provider.name,
    inventoryName: product.name,
    businessName: product.businessName,
    factoryName: product.factoryName,
    status: previous?.status ?? "draft",
    generatedTaskCodes: previous?.generatedTaskCodes ?? [],
    failureReason: previous?.failureReason ?? "",
    createdBy: previous?.createdBy ?? "系统管理员",
    createdTime: previous?.createdTime ?? `${payload.billDate} 10:00:00`,
    version: (previous?.version ?? 0) + 1,
  };
}

function transition(ids: string[], from: FeeItem["status"], to: FeeItem["status"]) {
  if (!ids.length) return failure("请选择需要操作的单据");
  const selected = rows.filter((row) => ids.includes(row.id));
  if (selected.length !== ids.length || selected.some((row) => row.status !== from))
    return failure(from === "draft" ? "只有未审核单据可以审核" : "只有已审核单据可以弃审");
  rows = rows.map((row) =>
    ids.includes(row.id)
      ? {
          ...row,
          status: to,
          version: row.version + 1,
          generatedTaskCodes: to === "approved" ? [`RW-${row.billCode.slice(-3)}`] : [],
        }
      : row
  );
  return success({ affectedIds: ids });
}

export default defineMock([
  {
    url: "pilot/task-fees/search",
    method: ["POST"],
    body({ body }: { body: FeeSearchRequest }) {
      try {
        const scope = queryScopeValue(body?.scope);
        return success(
          queryRecords(scope.organizationId === "org-a" ? rows : [], feeQuerySchema, body, {
            getKey: (row) => row.id,
            sortKeys: feeSortKeys,
            values: (row, key) => (key === "keyword" ? [row.billCode, row.remark] : [row[key]]),
          })
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : "查询参数无效");
      }
    },
  },
  {
    url: "pilot/task-fees",
    method: ["GET"],
    body: ({ query }: { query: Record<string, unknown> }) =>
      success(
        pageResult(
          rows,
          query,
          (row) =>
            `${row.billCode} ${row.principalPartyName} ${row.providerPartyName} ${row.inventoryName} ${row.remark}`,
          "billDate"
        )
      ),
  },
  {
    url: "pilot/task-fees",
    method: ["POST"],
    body({ body }: { body: FeeSavePayload }) {
      const error = validate(body);
      if (error) return failure(error);
      const id = `fee-${sequence}`;
      const billCode = `FY202609${String(sequence).padStart(3, "0")}`;
      sequence++;
      const item = materialize(id, billCode, body);
      rows = [item, ...rows];
      return success({ id, billCode, version: item.version }, "任务费用已保存到内存 Mock");
    },
  },
  {
    url: "pilot/task-fees/remove",
    method: ["POST"],
    body({ body }: { body?: Record<string, unknown> }) {
      const ids = bodyIds(body);
      const selected = rows.filter((row) => ids.includes(row.id));
      if (!ids.length || selected.length !== ids.length) return failure("待删除单据不存在");
      if (selected.some((row) => row.status !== "draft")) return failure("已审核单据不能删除");
      rows = rows.filter((row) => !ids.includes(row.id));
      return success({ affectedIds: ids });
    },
  },
  {
    url: "pilot/task-fees/approve",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(bodyIds(body), "draft", "approved"),
  },
  {
    url: "pilot/task-fees/revoke",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(bodyIds(body), "approved", "draft"),
  },
  {
    url: "pilot/task-fees/:id",
    method: ["GET"],
    body({ params }: { params: { id: string } }) {
      const item = rows.find((row) => row.id === params.id);
      return item ? success(item) : failure("任务费用不存在", "PILOT_NOT_FOUND");
    },
  },
  {
    url: "pilot/task-fees/:id",
    method: ["PUT"],
    body({ params, body }: { params: { id: string }; body: FeeSavePayload & { version: number } }) {
      const index = rows.findIndex((row) => row.id === params.id);
      const current = rows[index];
      if (!current) return failure("任务费用不存在", "PILOT_NOT_FOUND");
      if (current.status !== "draft") return failure("已审核单据不能编辑");
      if (current.version !== body.version) return failure("单据已被更新，请重新打开");
      const error = validate(body);
      if (error) return failure(error);
      const next = materialize(current.id, current.billCode, body, current);
      rows[index] = next;
      return success({ id: next.id, billCode: next.billCode, version: next.version });
    },
  },
]);
