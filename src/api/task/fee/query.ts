import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import { checkQuerySort, parseQueryWhere } from "@/components/business/search/model";
import type { FeeQueryScope, FeeSearchRequest } from "./types";

export const feeQuerySchema = {
  keyword: {
    label: "费用关键字",
    kind: "text",
    entries: ["quick"],
    operators: ["contains"],
    placeholder: "单据编号或备注",
  },
  billCode: {
    label: "单据编号",
    kind: "text",
    entries: ["normal", "advanced"],
    operators: ["contains", "eq"],
  },
  remark: {
    label: "备注",
    kind: "text",
    entries: ["advanced"],
    operators: ["contains", "eq", "isEmpty", "isNotEmpty"],
  },
  status: {
    label: "审核状态",
    kind: "enum",
    entries: ["normal", "advanced"],
    operators: ["eq", "in"],
    options: [
      { label: "草稿", value: "draft" },
      { label: "已审核", value: "approved" },
    ],
  },
  billDate: {
    label: "单据日期",
    kind: "date",
    entries: ["quick", "normal", "advanced"],
    operators: ["between", "eq", "gte", "lte"],
  },
  amount: {
    label: "金额",
    kind: "decimal",
    entries: ["normal", "advanced"],
    operators: ["between", "eq", "gte", "lte"],
  },
  principalPartyId: {
    label: "委托方",
    kind: "reference",
    valueType: "string",
    entries: ["normal", "advanced"],
    operators: ["eq", "in"],
  },
  providerPartyId: {
    label: "服务商",
    kind: "reference",
    valueType: "string",
    entries: ["normal", "advanced"],
    operators: ["eq", "in"],
  },
  inventoryId: {
    label: "药品",
    kind: "reference",
    valueType: "string",
    entries: ["advanced"],
    operators: ["eq", "in"],
  },
  createdTime: {
    label: "创建时间",
    kind: "datetime",
    entries: ["advanced"],
    operators: ["between", "eq", "gte", "lte"],
  },
} as const satisfies QuerySchema;
export const feeSortKeys = ["billCode", "billDate", "amount", "createdTime"] as const;
export function toFeeSearchRequest(
  query: QueryPageRequest<typeof feeQuerySchema, FeeQueryScope>
): FeeSearchRequest {
  const parsed = parseQueryWhere(feeQuerySchema, query.where);
  if (!parsed.valid) throw new Error(parsed.issues.map((issue) => issue.message).join("；"));
  return { ...query, where: parsed.where, sort: checkQuerySort(query.sort, feeSortKeys) };
}
