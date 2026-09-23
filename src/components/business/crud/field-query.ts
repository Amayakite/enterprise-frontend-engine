import type { QueryEntry, QueryField, QueryGroup, QueryNode, QuerySchema } from "../search/types";
import { parseQueryWhere } from "../search/model";
import type { ModuleField } from "./module-fields";

/** 默认查询规则；第一个操作符也是普通查询初始操作符。覆盖时整体替换，不追加。 */
export const FIELD_QUERY_OPERATORS = {
  text: ["contains", "eq", "ne", "notContains", "startsWith", "endsWith", "isEmpty", "isNotEmpty"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "between", "isEmpty", "isNotEmpty"],
  decimal: ["eq", "ne", "gt", "gte", "lt", "lte", "between", "isEmpty", "isNotEmpty"],
  date: ["between", "eq", "ne", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  datetime: ["between", "eq", "ne", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  boolean: ["eq", "ne", "isEmpty", "isNotEmpty"],
  enum: ["eq", "in", "ne", "notIn", "isEmpty", "isNotEmpty"],
  reference: ["eq", "in", "ne", "notIn", "isEmpty", "isNotEmpty"],
} as const satisfies Record<QueryField["kind"], readonly string[]>;

/**
 * 从唯一字段数组派生查询界面；不读取表单实例、不发请求，不修改 fields。
 * @param fields 模块 config.fields；只处理显式声明 scenes.query 的字段。
 * @returns schema 及关键词展开器；keyword 是虚拟查询项，不加入模型或保存 DTO。
 * @throws 重复映射、不支持的字段类型、非法操作符或动态字典缺少查询定义时抛错。
 * @example
 * `const query = compileFieldQuery(fields);`
 */
export function compileFieldQuery<M, C>(fields: readonly ModuleField<M, C, QuerySchema>[]) {
  /** 由字段生成的查询白名单，限定后续允许的字段类型和运算符。 */
  const schema: Record<string, QueryField> = {};
  /** 参与顶部关键词搜索的字段名，后续把一个关键词展开为多个 OR 条件。 */
  const keywords: string[] = [];
  for (const field of fields) {
    /** 当前字段的查询设置，没有声明则不出现在查询界面。 */
    const scene = field.scenes.query;
    if (!scene) continue;
    /** 查询使用的字段名，可由 scene.key 映射到接口字段，不能重复或占用 keyword。 */
    const key = scene.key ?? field.key;
    if (key === "keyword" || Object.hasOwn(schema, key))
      throw new Error(`重复或保留的查询字段：${key}`);
    /** 记录当前字段允许出现的普通/高级查询入口。 */
    const entries: QueryEntry[] = [];
    if (scene.normal) entries.push("normal");
    if (scene.advanced) entries.push("advanced");
    /** 各输入类型共用的标签、入口、提示和自定义输入配置。 */
    const base = {
      label: field.label,
      entries,
      input: scene.input,
      placeholder: scene.placeholder,
    };
    /** 根据字段类型生成的查询定义，后续再校验业务覆盖的运算符。 */
    let definition: QueryField;
    switch (field.type) {
      case "text":
      case "textarea":
        definition = { ...base, kind: "text", operators: FIELD_QUERY_OPERATORS.text };
        break;
      case "number":
        definition = { ...base, kind: "number", operators: FIELD_QUERY_OPERATORS.number };
        break;
      case "amount":
        definition = { ...base, kind: "decimal", operators: FIELD_QUERY_OPERATORS.decimal };
        break;
      case "date":
      case "datetime":
        definition = { ...base, kind: field.type, operators: FIELD_QUERY_OPERATORS[field.type] };
        break;
      case "switch":
        definition = { ...base, kind: "boolean", operators: FIELD_QUERY_OPERATORS.boolean };
        break;
      case "select":
        definition = {
          ...base,
          kind: "enum",
          options: field.options.map((option) => {
            if (typeof option.value !== "string" && typeof option.value !== "number")
              throw new Error(`查询选项 ${key} 只支持字符串或数字`);
            return { label: option.label, value: option.value };
          }),
          operators: FIELD_QUERY_OPERATORS.enum,
        };
        break;
      case "dict":
        if (typeof field.dict.code !== "string" || field.dict.valueType === "preserve")
          throw new Error(`查询字典 ${key} 需要静态 code 和明确的 string/number 值类型`);
        definition = {
          ...base,
          kind: "enum",
          options: [],
          dictionary: {
            code: field.dict.code,
            valueType: field.dict.valueType,
          },
          operators: FIELD_QUERY_OPERATORS.enum,
        };
        break;
      case "reference":
        definition = {
          ...base,
          kind: "reference",
          valueType: scene.valueType ?? "string",
          operators: FIELD_QUERY_OPERATORS.reference,
        };
        break;
      default:
        throw new Error(`字段 ${key} 的 ${field.type} 暂不支持自动查询，请使用独立 schema 接法`);
    }
    if (scene.operators) {
      /** 该查询类型允许的操作，用来拒绝与字段类型不匹配的覆盖配置。 */
      const allowed: readonly string[] = definition.operators;
      if (
        !scene.operators.length ||
        scene.operators.some((operator) => !allowed.includes(operator))
      )
        throw new Error(`字段 ${key} 的查询操作符与 ${field.type} 不兼容`);
      // 已逐项验证属于当前分支；只替换操作符数组，不改变字段类型或选项。
      Object.assign(definition, { operators: [...scene.operators] });
    }
    if (scene.keyword) {
      if (definition.kind !== "text" || !definition.operators.includes("contains"))
        throw new Error(`关键词字段 ${key} 必须是支持 contains 的文本`);
      keywords.push(key);
    }
    Object.defineProperty(schema, key, { value: definition, enumerable: true, configurable: true });
  }
  if (keywords.length)
    schema.keyword = {
      label: "关键词",
      kind: "text",
      entries: ["quick"],
      operators: ["contains"],
      placeholder: keywords.map((key) => schema[key].label).join("、"),
    };
  /**
   * 将虚拟关键词替换为业务字段 OR 组；保留外层 AND/OR 和固定 scope。
   * @param where 已应用 AST；null 原样返回。不修改传入对象。
   * @returns 可直接交给 API 适配层的 AST；非法输入或展开超限会抛错。
   * @example
   * `const request = { ...input, where: query.expand(input.where) };`
   */
  function expand(where: QueryNode<QuerySchema> | null): QueryGroup<QuerySchema> | null {
    /** 递归展开关键词节点为多个字段的 OR 条件，其他节点保持原意。 */
    const visit = (node: QueryNode<QuerySchema>): unknown => {
      if (node.kind === "group") return { ...node, children: node.children.map(visit) };
      if (node.field !== "keyword") return node;
      if (node.operator !== "contains" || !keywords.length) throw new Error("关键词查询参数不正确");
      return {
        kind: "group",
        id: node.id,
        operator: "or",
        children: keywords.map((key, i) => ({
          ...node,
          id: `${node.id}:${i}`,
          field: key,
        })),
      };
    };
    const parsed = parseQueryWhere(schema, where === null ? null : visit(where));
    if (!parsed.valid) throw new Error(parsed.issues.map((issue) => issue.message).join("；"));
    return parsed.where;
  }
  return { schema, expand };
}
