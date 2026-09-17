import { cloneModel } from "@/components/business/fields/model";
import { isEmptyValue } from "@/utils/validate";
import { normalizeSearchText } from "@/utils/string";
import { serializeStableKey } from "@/utils/identity";
import { isDecimalString, toDecimal } from "@/utils/decimal";
import { parseDate, DATE_FORMAT, DATE_TIME_FORMAT } from "@/utils/date";
import type {
  AppliedQuery,
  QueryApplyResult,
  QueryCondition,
  QueryDraft,
  QueryDraftCondition,
  QueryDraftGroup,
  QueryEntry,
  QueryField,
  QueryGroup,
  QueryIssue,
  QueryNode,
  QuerySchema,
  QueryValueEditor,
} from "./types";

export const QUERY_LIMITS = {
  depth: 3,
  groups: 20,
  conditions: 50,
  members: 100,
  text: 256,
} as const;
/** 只覆盖输入呈现，保留 API schema 的字段/值/运算符合同与泛型身份。 */
export function withQueryInputs<S extends QuerySchema>(
  schema: S,
  inputs: Partial<Record<Extract<keyof S, string>, QueryValueEditor>>
): S {
  const result = { ...schema };
  for (const key in inputs) {
    const input = inputs[key];
    if (input && Object.hasOwn(schema, key))
      Object.assign(result, { [key]: { ...schema[key], input } });
  }
  return result;
}
export const QUERY_OPERATORS: Readonly<Record<string, string>> = {
  eq: "等于",
  ne: "不等于",
  contains: "包含",
  notContains: "不包含",
  startsWith: "开头为",
  endsWith: "结尾为",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  between: "区间",
  in: "属于",
  notIn: "不属于",
  isEmpty: "为空",
  isNotEmpty: "不为空",
};
/** 验证排序字段和方向是否属于白名单；非法输入抛错，不默默允许任意字段。 */
export function checkQuerySort<Key extends string>(
  value: unknown,
  keys: readonly Key[]
): {
  /**
   * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
   */
  key: Key;
  /**
   * 排序方向：asc 升序、desc 降序；取消排序请把整个 sort 设为 null。
   */
  order: "asc" | "desc";
} | null {
  if (value === null || value === undefined) return null;
  if (!record(value)) throw new Error("排序参数不正确");
  const key = keys.find((item) => item === value.key);
  if (key === undefined || (value.order !== "asc" && value.order !== "desc"))
    throw new Error("不支持的排序字段或方向");
  return { key, order: value.order };
}
const emptyOperators = new Set(["isEmpty", "isNotEmpty"]);
const kindOperators: Record<QueryField["kind"], readonly string[]> = {
  text: ["eq", "ne", "contains", "notContains", "startsWith", "endsWith"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "between"],
  decimal: ["eq", "ne", "gt", "gte", "lt", "lte", "between"],
  date: ["eq", "ne", "gt", "gte", "lt", "lte", "between"],
  datetime: ["eq", "ne", "gt", "gte", "lt", "lte", "between"],
  boolean: ["eq", "ne"],
  enum: ["eq", "ne", "in", "notIn"],
  reference: ["eq", "ne", "in", "notIn"],
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** 提取查询固定范围值；兼容声明的范围形式，不合并用户 where 条件。 */
export function queryScopeValue(scope: unknown): Readonly<Record<string, unknown>> {
  if (
    !record(scope) ||
    typeof scope.key !== "string" ||
    !scope.key.trim() ||
    scope.key.length > 512 ||
    !record(scope.value)
  )
    throw new Error("固定查询范围不正确");
  return scope.value;
}
/** 判断查询输入是否应视为空；数字 0 与布尔 false 不是空值。 */
export function isEmptyQueryValue(value: unknown) {
  return isEmptyValue(value) || (typeof value === "string" && value.trim() === "");
}
/** 按 key 读取 schema 中的字段声明；只允许 schema 自身拥有的字段。 */
export function queryField(schema: QuerySchema, key: unknown): QueryField | undefined {
  return typeof key === "string" && Object.hasOwn(schema, key) ? schema[key] : undefined;
}
function scalarValid(field: QueryField, value: unknown, input = true): boolean {
  if (isEmptyQueryValue(value)) return false;
  switch (field.kind) {
    case "text":
      return typeof value === "string" && (!input || value.length <= QUERY_LIMITS.text);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "decimal":
      return isDecimalString(value) && value.length <= 64;
    case "boolean":
      return typeof value === "boolean";
    case "date":
    case "datetime":
      return (
        typeof value === "string" &&
        !!parseDate(value, field.kind === "date" ? DATE_FORMAT : DATE_TIME_FORMAT)
      );
    case "enum":
      return field.dictionary
        ? typeof value === field.dictionary.valueType &&
            (typeof value === "number"
              ? Number.isFinite(value)
              : typeof value === "string" && value.length <= QUERY_LIMITS.text)
        : field.options.some((option) => option.value === value);
    case "reference":
      if (
        typeof value !== field.valueType ||
        (typeof value !== "string" && typeof value !== "number")
      )
        return false;
      try {
        serializeStableKey(value);
        return typeof value !== "string" || value.length <= QUERY_LIMITS.text;
      } catch {
        return false;
      }
  }
}
/** 同一字段语义用于区间校验、查询求值和排序；非法/空值不能参与比较。 */
export function compareQueryValues(
  field: QueryField,
  left: unknown,
  right: unknown
): number | null {
  if (!scalarValid(field, left, false) || !scalarValid(field, right, false)) return null;
  if (field.kind === "decimal" && typeof left === "string" && typeof right === "string")
    return toDecimal(left).comparedTo(toDecimal(right));
  if (field.kind === "date" || field.kind === "datetime") {
    const format = field.kind === "date" ? DATE_FORMAT : DATE_TIME_FORMAT;
    const a = parseDate(String(left), format)!.valueOf();
    const b = parseDate(String(right), format)!.valueOf();
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (field.kind === "text") {
    const a = normalizeSearchText(String(left));
    const b = normalizeSearchText(String(right));
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof left !== typeof right) return null;
  if (left === right) return 0;
  if (typeof left === "number" && typeof right === "number") return left < right ? -1 : 1;
  if (typeof left === "string" && typeof right === "string") return left < right ? -1 : 1;
  return left === false ? -1 : 1;
}
/** 创建独立的空查询条件集合；调用者可作为列表初始查询使用。 */
export function emptyAppliedQuery<S extends QuerySchema>(): AppliedQuery<S> {
  return { quick: [], normal: [], advanced: null };
}
/** 将已应用查询复制为可编辑草稿；编辑草稿不会提前改变当前请求条件。 */
export function createQueryDraft<S extends QuerySchema>(
  schema: S,
  applied: AppliedQuery<S> = emptyAppliedQuery<S>()
): QueryDraft<S> {
  const condition = (item: QueryCondition<S>): QueryDraftCondition<S> => ({
    kind: "condition",
    id: item.id,
    field: item.field,
    operator: item.operator,
    value: "value" in item ? cloneModel(item.value) : undefined,
  });
  const flat = (entry: "quick" | "normal"): QueryDraftCondition<S>[] => {
    const values = applied[entry].map(condition);
    for (const key of Object.keys(schema).filter((key) => schema[key]!.entries.includes(entry))) {
      if (!values.some((item) => item.field === key))
        values.push({
          kind: "condition",
          id: `${entry}:${key}`,
          field: key as Extract<keyof S, string>,
          operator: schema[key]!.operators[0] ?? null,
          value: null,
        });
    }
    return values;
  };
  // 通过已应用合同重建可写草稿；不共享子数组。
  const group = (node: QueryGroup<S>): QueryDraftGroup<S> => ({
    kind: "group",
    id: node.id,
    operator: node.operator,
    children: node.children.map((item) => (item.kind === "group" ? group(item) : condition(item))),
  });
  return {
    quick: flat("quick"),
    normal: flat("normal"),
    advanced: applied.advanced ? group(applied.advanced) : null,
  };
}

function parser<S extends QuerySchema>(schema: S, wire = false) {
  const issues: QueryIssue[] = [];
  const ids = new Set<string>();
  let conditions = 0,
    groups = 0;
  const fail = (nodeId: string, message: string) => {
    issues.push({ nodeId, message });
    return null;
  };
  function parse(value: unknown, entry?: QueryEntry, depth = 1, root = false): QueryNode<S> | null {
    if (!record(value)) return fail("query", "查询节点格式不正确");
    const id = typeof value.id === "string" ? value.id : "query";
    if (typeof value.id !== "string" || !id.trim() || id.length > 128 || ids.has(id))
      return fail(id, "条件标识为空、重复或过长");
    ids.add(id);
    if (value.kind === "group") {
      groups++;
      const extra = wire ? 1 : 0;
      if (depth > QUERY_LIMITS.depth + extra || groups > QUERY_LIMITS.groups + extra)
        return fail(id, "条件组超出深度或数量限制");
      if (value.operator !== "and" && value.operator !== "or") return fail(id, "请选择 AND 或 OR");
      if (
        !Array.isArray(value.children) ||
        value.children.length > QUERY_LIMITS.conditions + QUERY_LIMITS.groups
      )
        return fail(id, "条件组内容或数量不正确");
      if (!value.children.length)
        return root && !wire ? null : fail(id, "请删除空条件组或添加条件");
      const children = value.children
        .map((child) => parse(child, entry, depth + 1))
        .filter((item) => item !== null);
      if (!children.length) return null;
      return {
        kind: "group",
        id,
        operator: value.operator,
        children: children as [QueryNode<S>, ...QueryNode<S>[]],
      };
    }
    if (value.kind !== "condition") return fail(id, "不支持的查询节点");
    const field = queryField(schema, value.field);
    if (!field || (entry && !field.entries.includes(entry)))
      return fail(id, "该字段不支持当前查询入口");
    const operator = value.operator;
    if (
      typeof operator !== "string" ||
      !field.operators.some((item) => item === operator) ||
      (!emptyOperators.has(operator) && !kindOperators[field.kind]?.includes(operator))
    )
      return fail(id, "请选择字段支持的运算符");
    if (
      entry !== "advanced" &&
      !wire &&
      !emptyOperators.has(operator) &&
      isEmptyQueryValue(value.value)
    )
      return null;
    if (++conditions > QUERY_LIMITS.conditions)
      return fail(id, `最多 ${QUERY_LIMITS.conditions} 条条件`);
    let normalized = value.value;
    if (emptyOperators.has(operator)) {
      if (normalized !== undefined) return fail(id, "空值运算符不接受比较值");
    } else if (operator === "between") {
      if (
        !Array.isArray(normalized) ||
        normalized.length !== 2 ||
        normalized.some((item) => !scalarValid(field, item))
      )
        return fail(id, "请填写两个有效区间端点");
      const compared = compareQueryValues(field, normalized[0], normalized[1]);
      if (compared === null || compared > 0) return fail(id, "区间起点不能晚于或大于终点");
      normalized = [...normalized];
    } else if (operator === "in" || operator === "notIn") {
      if (
        !Array.isArray(normalized) ||
        !normalized.length ||
        normalized.length > QUERY_LIMITS.members ||
        normalized.some((item) => !scalarValid(field, item))
      )
        return fail(id, `请选择 1—${QUERY_LIMITS.members} 个有效值`);
      normalized = [...new Set(normalized)];
    } else {
      if (!scalarValid(field, normalized)) return fail(id, "请填写与字段类型一致的有效值");
      if (field.kind === "text") normalized = (normalized as string).trim();
    }
    // 字段、运算符与值已经按 schema 联合验证，在动态输入边界恢复关联类型。
    return {
      kind: "condition",
      id,
      field: value.field,
      operator,
      ...(emptyOperators.has(operator) ? {} : { value: normalized }),
    } as unknown as QueryCondition<S>;
  }
  return { parse, issues };
}
/** 组合快捷、普通和高级查询为统一条件树；没有条件返回 null。 */
export function combineQuery<S extends QuerySchema>(
  applied: AppliedQuery<S>
): QueryGroup<S> | null {
  const children: QueryNode<S>[] = [
    ...applied.quick,
    ...applied.normal,
    ...(applied.advanced ? [applied.advanced] : []),
  ];
  return children.length
    ? {
        kind: "group",
        id: "$applied",
        operator: "and",
        children: children as [QueryNode<S>, ...QueryNode<S>[]],
      }
    : null;
}
/** 校验未信任的查询草稿并转为已应用条件；失败返回可定位 issues，不发请求。 */
export function applyQueryDraft<S extends QuerySchema>(
  schema: S,
  draft: QueryDraft<S>
): QueryApplyResult<S> {
  const { parse, issues } = parser(schema);
  const flat = (entry: "quick" | "normal") => {
    const seen = new Set<string>();
    if (!Array.isArray(draft[entry]) || draft[entry].length > QUERY_LIMITS.conditions) {
      issues.push({ nodeId: entry, message: "查询条件数量超限" });
      return [];
    }
    return draft[entry].flatMap((item) => {
      if (!item || item.kind !== "condition") {
        issues.push({ nodeId: entry, message: "快捷/普通查询只接受条件项" });
        return [];
      }
      if (item.field && seen.has(item.field)) {
        issues.push({ nodeId: item.id, message: "同一入口不能重复配置字段" });
        return [];
      }
      if (item.field) seen.add(item.field);
      const condition = parse(item, entry);
      return condition?.kind === "condition" ? [condition] : [];
    });
  };
  const quick = flat("quick"),
    normal = flat("normal");
  const advanced = draft.advanced === null ? null : parse(draft.advanced, "advanced", 1, true);
  if (advanced && advanced.kind !== "group")
    issues.push({ nodeId: advanced.id, message: "高级查询根必须为条件组" });
  if (issues.length) return { valid: false, issues };
  const applied: AppliedQuery<S> = {
    quick,
    normal,
    advanced: advanced?.kind === "group" ? advanced : null,
  };
  return { valid: true, applied, where: combineQuery(applied) };
}
/** API/Mock 边界不可直接信任 TS 类型；同样校验字段、节点数和操作值。 */
export function parseQueryWhere<S extends QuerySchema>(
  schema: S,
  value: unknown
):
  | {
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: true;
      /**
       * 校验后的查询树；null 表示没有用户条件。unknown 输入必须先解析，不能直接拼 SQL。
       */
      where: QueryGroup<S> | null;
    }
  | {
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: false;
      /**
       * 校验失败明细；包含定位信息与提示文案，成功分支不需要填写。
       */
      issues: QueryIssue[];
    } {
  if (value === null) return { valid: true, where: null };
  const { parse, issues } = parser(schema, true);
  const where = parse(value);
  if (!where || where.kind !== "group")
    issues.push({ nodeId: "query", message: "where 必须为非空条件组或 null" });
  return !issues.length && where?.kind === "group"
    ? { valid: true, where }
    : { valid: false, issues };
}
/** 从查询草稿中移除指定节点；用于高级条件编辑，不操作服务端数据。 */
export function removeQueryNode<S extends QuerySchema>(
  applied: AppliedQuery<S>,
  id: string
): AppliedQuery<S> {
  const remove = (node: QueryNode<S>): QueryNode<S> | null => {
    if (node.id === id) return null;
    if (node.kind === "condition") return cloneModel(node);
    const children = node.children.map(remove).filter((item) => item !== null);
    return children.length
      ? { ...node, children: children as [QueryNode<S>, ...QueryNode<S>[]] }
      : null;
  };
  const advanced = applied.advanced ? remove(applied.advanced) : null;
  return {
    quick: applied.quick.filter((node) => node.id !== id).map(cloneModel),
    normal: applied.normal.filter((node) => node.id !== id).map(cloneModel),
    advanced: advanced?.kind === "group" ? advanced : null,
  };
}
/** 生成查询条件的可读摘要；用于界面展示，不作为后端查询语句。 */
export function querySummary<S extends QuerySchema>(schema: S, node: QueryNode<S>): string {
  if (node.kind === "group")
    return `（${node.children.map((child) => querySummary(schema, child)).join(node.operator === "and" ? " 且 " : " 或 ")}）`;
  const field = schema[node.field];
  const label = (value: unknown) =>
    field?.kind === "enum"
      ? (field.options.find((option) => option.value === value)?.label ?? String(value))
      : typeof value === "boolean"
        ? value
          ? "是"
          : "否"
        : String(value);
  const value = "value" in node ? node.value : undefined;
  return `${field?.label ?? node.field} ${QUERY_OPERATORS[node.operator] ?? node.operator}${value === undefined ? "" : ` ${Array.isArray(value) ? value.map(label).join(node.operator === "between" ? " 至 " : "、") : label(value)}`}`;
}
