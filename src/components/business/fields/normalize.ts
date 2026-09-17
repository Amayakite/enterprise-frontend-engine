import type { FieldCondition, FieldDefinition, FieldEnvironment, SearchField } from "./types";

/**
 * 保留模型字段关联的配置定义辅助函数；检查重复字段后返回原配置。
 * @throws 同一字段 key 重复时抛错，不按后写配置覆盖。
 * @example
 * `const fields = defineFields<CustomerFormModel>()([{ key: "customerName", label: "名称", type: "text" }]);`
 */
export function defineFields<M, C = undefined>() {
  return (fields: readonly FieldDefinition<M, C>[]) => {
    const keys = new Set<string>();
    for (const field of fields) {
      if (keys.has(field.key)) throw new Error(`重复字段：${field.key}`);
      keys.add(field.key);
    }
    return fields;
  };
}

/** 查询使用独立 Query 模型；key 就是 queryKey，不从编辑字段隐式继承类型。 */
export function buildSearchFields<Q, C = undefined>() {
  return (fields: readonly SearchField<Q, C>[]) => {
    const keys = fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) throw new Error("重复查询字段");
    for (const field of fields) {
      const operator = field.search.operator;
      if (!["eq", "contains", "in", "between"].includes(operator))
        throw new Error("不支持的查询操作符");
      if (operator === "between" && field.type !== "dateRange")
        throw new Error("between 需要 dateRange 字段");
    }
    return fields;
  };
}

/** 计算布尔值或环境回调条件；未配置时使用指定默认值，不引入额外响应式状态。 */
export function testCondition<M, C>(
  condition: FieldCondition<M, C> | undefined,
  env: FieldEnvironment<M, C>,
  fallback: boolean
) {
  return typeof condition === "function" ? condition(env) : (condition ?? fallback);
}

/**
 * 将字段声明归一化为当前模式可用的表单/详情/表格描述；不负责网络请求。
 * @param fields 统一字段声明；函数不修改原数组。
 * @param env 当前模型、业务上下文与 add/edit 模式。
 * @param readonly 宿主是否只读；与字段自己的只读条件合并。
 * @returns 归一化数组；默认 span 为 1，group 为空，rules 为空数组。
 */
export function normalizeFields<M, C>(
  fields: readonly FieldDefinition<M, C>[],
  env: FieldEnvironment<M, C>,
  readonly = false
) {
  return fields.map((field) => {
    const form = field.form || undefined;
    return {
      field,
      form: form
        ? {
            visible:
              (form.modes ?? ["add", "edit"]).includes(env.mode) &&
              testCondition(form.visible, env, true),
            readonly: readonly || testCondition(form.readonly, env, false),
            required: testCondition(form.required, env, false),
            span: form.span ?? 1,
            group: form.group ?? "",
            rules: form.rules ? (Array.isArray(form.rules) ? form.rules : [form.rules]) : [],
          }
        : undefined,
      detail: field.detail
        ? {
            span: typeof field.detail === "object" ? (field.detail.span ?? 1) : 1,
            group: typeof field.detail === "object" ? (field.detail.group ?? "") : "",
          }
        : undefined,
      table: field.table || undefined,
    };
  });
}
