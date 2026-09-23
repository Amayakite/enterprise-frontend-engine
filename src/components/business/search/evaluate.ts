import { normalizeSearchText } from "@/utils/string";
import { serializeStableKey } from "@/utils/identity";
import type { PageResult } from "@/types/http";
import { checkQuerySort, compareQueryValues, isEmptyQueryValue, parseQueryWhere } from "./model";
import type { QueryCondition, QueryField, QueryNode, QuerySchema } from "./types";

/** 递归判断一条记录是否满足条件组，AND 要全部成立、OR 只需一项成立。 */
function matches<S extends QuerySchema>(
  field: QueryField,
  condition: QueryCondition<S>,
  actual: unknown
): boolean {
  const operator = condition.operator;
  if (operator === "isEmpty") return isEmptyQueryValue(actual);
  if (operator === "isNotEmpty") return !isEmptyQueryValue(actual);
  if (isEmptyQueryValue(actual)) return false;
  const wanted: unknown = "value" in condition ? condition.value : undefined;
  if (operator === "between" && Array.isArray(wanted)) {
    const low = compareQueryValues(field, actual, wanted[0]);
    const high = compareQueryValues(field, actual, wanted[1]);
    return low !== null && high !== null && low >= 0 && high <= 0;
  }
  if ((operator === "in" || operator === "notIn") && Array.isArray(wanted)) {
    const comparisons = wanted.map((item) => compareQueryValues(field, actual, item));
    if (comparisons.every((value) => value === null)) return false;
    return operator === "in" ? comparisons.includes(0) : !comparisons.includes(0);
  }
  const compared = compareQueryValues(field, actual, wanted);
  if (compared === null) return false;
  switch (operator) {
    case "eq":
      return compared === 0;
    case "ne":
      return compared !== 0;
    case "gt":
      return compared > 0;
    case "gte":
      return compared >= 0;
    case "lt":
      return compared < 0;
    case "lte":
      return compared <= 0;
    case "contains":
      return normalizeSearchText(String(actual)).includes(normalizeSearchText(String(wanted)));
    case "notContains":
      return !normalizeSearchText(String(actual)).includes(normalizeSearchText(String(wanted)));
    case "startsWith":
      return normalizeSearchText(String(actual)).startsWith(normalizeSearchText(String(wanted)));
    case "endsWith":
      return normalizeSearchText(String(actual)).endsWith(normalizeSearchText(String(wanted)));
    default:
      return false;
  }
}
/** values 用于 keyword 在白名单文本字段间做 OR，不扫描整条记录。 */
export function evaluateQuery<S extends QuerySchema>(
  schema: S,
  node: QueryNode<S> | null,
  values: (field: Extract<keyof S, string>) => readonly unknown[]
): boolean {
  if (!node) return true;
  if (node.kind === "group")
    return node.operator === "and"
      ? node.children.every((child) => evaluateQuery(schema, child, values))
      : node.children.some((child) => evaluateQuery(schema, child, values));
  const field = schema[node.field];
  return !!field && values(node.field).some((value) => matches(field, node, value));
}
/** 只负责已限定范围的集合；调用方先从可信上下文限定数据范围。 */
export function queryRecords<Row, S extends QuerySchema>(
  rows: readonly Row[],
  schema: S,
  request: {
    /**
     * 校验后的查询树；null 表示没有用户条件。unknown 输入必须先解析，不能直接拼 SQL。
     */
    where: unknown;
    /**
     * 页码，从 1 开始；修改分页时通过 setPage 调用。
     * @example
     * `pageNum: 1`
     */
    pageNum: unknown;
    /**
     * 每页条数，通常 10/20/50/100；接口仍需限制最大值。
     * @example
     * `pageSize: 20`
     */
    pageSize: unknown;
    /**
     * 排序字段和方向；null 表示不指定用户排序，字段须属于 API 排序白名单。
     * @example
     * `sort: { key: "code", order: "asc" }`
     */
    sort?: unknown;
  },
  options: {
    /**
     * 从实体提取稳定主键；保持后端 ID 类型，数字 0 也有效。
     * @example
     * `getKey: row => row.id`
     */
    getKey: (row: Row) => string | number;

    /**
     * 取得某行某字段的可比较值集合；多值字段返回多个值，缺失值按查询规则处理。
     */
    values: (row: Row, field: Extract<keyof S, string>) => readonly unknown[];

    /**
     * 允许排序的字段白名单；不得信任用户随意传入的列名。
     */
    sortKeys: readonly Extract<keyof S, string>[];
  }
): PageResult<Row> {
  const parsed = parseQueryWhere(schema, request.where);
  if (!parsed.valid) throw new Error(parsed.issues.map((issue) => issue.message).join("；"));
  const { pageNum, pageSize } = request;
  if (
    typeof pageNum !== "number" ||
    !Number.isSafeInteger(pageNum) ||
    pageNum < 1 ||
    typeof pageSize !== "number" ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new Error("分页参数不正确");
  const sort = checkQuerySort(request.sort, options.sortKeys);
  const filtered = rows.filter((row) =>
    evaluateQuery(schema, parsed.where, (field) => options.values(row, field))
  );
  filtered.sort((a, b) => {
    if (sort) {
      const left = options.values(a, sort.key)[0],
        right = options.values(b, sort.key)[0];
      if (isEmptyQueryValue(left) !== isEmptyQueryValue(right))
        return isEmptyQueryValue(left) ? 1 : -1;
      const value = compareQueryValues(schema[sort.key]!, left, right);
      if (value) return sort.order === "asc" ? value : -value;
    }
    return serializeStableKey(options.getKey(a)).localeCompare(
      serializeStableKey(options.getKey(b))
    );
  });
  const offset = (pageNum - 1) * pageSize;
  return { list: filtered.slice(offset, offset + pageSize), total: filtered.length };
}
