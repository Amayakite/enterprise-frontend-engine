import { normalizeFields } from "../fields/normalize";
import type { FieldDefinition, FieldEnvironment, FieldKey } from "../fields/types";
import type { CrudDetailSummary } from "./layout";

/**
 * 从详情可见字段中提取摘要，并返回未进入摘要的资料字段。
 * @param fields 同一详情字段配置，不修改输入。
 * @param env 当前只读详情模型与上下文；显隐沿用原字段合同。
 * @param summary 摘要字段键；省略时所有资料保持原样。
 * @returns 标题、状态、辅助字段和剩余字段；重复键只展示一次，隐藏字段不会泄漏。
 * @example
 * `const parts = resolveDetailSummary(fields, env, { titleField: "name" });`
 */
export function resolveDetailSummary<M extends object, C>(
  fields: readonly FieldDefinition<M, C>[],
  env: FieldEnvironment<M, C>,
  summary?: CrudDetailSummary<M>
) {
  const visible = normalizeFields(fields, env, true).filter((entry) => entry.detail);
  const used = new Set<FieldKey<M>>();
  function take(key: FieldKey<M> | undefined) {
    if (key === undefined || used.has(key)) return undefined;
    const entry = visible.find((item) => item.field.key === key);
    if (!entry) return undefined;
    used.add(key);
    return entry.field;
  }
  const title = take(summary?.titleField);
  const status = (summary?.statusFields ?? []).flatMap((key) => {
    const field = take(key);
    return field ? [field] : [];
  });
  const description = (summary?.descriptionFields ?? []).flatMap((key) => {
    const field = take(key);
    return field ? [field] : [];
  });
  // 分组标题附着在组首字段；提取组首后把标题传给下一资料字段。
  let pendingGroup = "";
  const remaining: FieldDefinition<M, C>[] = [];
  for (const field of fields) {
    if (!field.detail) continue;
    const group = typeof field.detail === "object" ? field.detail.group : undefined;
    if (group) pendingGroup = group;
    if (used.has(field.key)) continue;
    const copy = Object.assign({}, field);
    if (pendingGroup)
      copy.detail = {
        ...(typeof field.detail === "object" ? field.detail : {}),
        group: pendingGroup,
      };
    remaining.push(copy);
    pendingGroup = "";
  }
  return { title, status, description, fields: remaining };
}
