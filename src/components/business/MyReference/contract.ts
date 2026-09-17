import { parseDate, DATE_FORMAT } from "@/utils/date";
import { serializeStableKey } from "@/utils/identity";
import type { PageResult } from "@/types/http";
import type {
  ReferenceId,
  ReferenceResolveResult,
  ReferenceFilters,
  ReferenceSearchField,
  ReferenceCondition,
} from "./types";

/** 校验参照分页回执结构及行键，拒绝不合法返回；不会发起请求。 */
export function checkReferencePage<Row, Id extends ReferenceId>(
  result: PageResult<Row>,
  getKey: (row: Readonly<Row>) => Id,
  limit: number
) {
  if (
    !result ||
    !Array.isArray(result.list) ||
    !Number.isSafeInteger(result.total) ||
    result.total < result.list.length ||
    result.list.length > limit
  ) {
    throw new Error("参照分页结果不符合合同");
  }
  const keys = result.list.map((row) => serializeStableKey(getKey(row)));
  if (new Set(keys).size !== keys.length) throw new Error("参照返回重复 ID");
  return result;
}

/** 校验按 ID 回显结果，确认返回行与请求 ID 一致；用于搜索之外的旧值合法性检查。 */
export function checkReferenceResolve<Row, Id extends ReferenceId>(
  result: ReferenceResolveResult<Row, Id>,
  ids: readonly Id[],
  getKey: (row: Readonly<Row>) => Id
) {
  if (!result || !Array.isArray(result.items) || !Array.isArray(result.unavailableIds)) {
    throw new Error("参照回显结果不符合合同");
  }
  const expected = new Set(ids.map(serializeStableKey));
  const returned = [...result.items.map(getKey), ...result.unavailableIds].map(serializeStableKey);
  if (
    returned.length !== expected.size ||
    new Set(returned).size !== returned.length ||
    returned.some((key) => !expected.has(key))
  )
    throw new Error("参照回显 ID 存在漏项、重复或越界");
  return result;
}

/** filters 为扁平 JSON 条件合同；键顺序变化不产生新的缓存上下文。 */
export function referenceFilterKey(filters: ReferenceFilters): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(filters)
        .sort()
        .map((key) => [key, filters[key]])
    )
  );
}
/** 校验参照查询条件与数据源支持的字段/操作符；不将非法输入传给接口。 */
export function checkReferenceConditions(
  fields: readonly ReferenceSearchField[],
  conditions: readonly ReferenceCondition[]
) {
  const seen = new Set<string>();
  for (const condition of conditions) {
    const field = fields.find(
      (item) => item.key === condition.key && item.operator === condition.operator
    );
    if (!field || seen.has(condition.key)) throw new Error("查询条件不在 source 白名单中或重复");
    seen.add(condition.key);
    const value = condition.value;
    if (field.type === "text" && typeof value === "string" && field.operator === "contains")
      continue;
    if (
      field.type === "select" &&
      field.operator === "eq" &&
      field.options?.some((item) => item.value === value)
    )
      continue;
    if (
      field.type === "dateRange" &&
      field.operator === "between" &&
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((item) => typeof item === "string" && parseDate(item, DATE_FORMAT) !== null) &&
      value[0] <= value[1]
    )
      continue;
    throw new Error(`查询条件“${field.label}”的值无效`);
  }
  return conditions;
}
