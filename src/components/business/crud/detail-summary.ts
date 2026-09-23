import { normalizeFields } from "../fields/normalize";
import type { FieldDefinition, FieldEnvironment, FieldKey } from "../fields/types";
import type { CrudDetailSummary } from "./layout";

/**
 * 从详情可见字段中提取摘要，并返回未进入摘要的资料字段。
 * @param fields 同一详情字段配置，不修改输入。
 * @param env 当前只读详情模型与上下文；显隐沿用原字段配置。
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
  /** 仅保留开启详情显示的字段，未显示的字段不能被选入页头摘要。 */
  const visible = normalizeFields(fields, env, true).filter((entry) => entry.detail);
  /** 记录已经放进标题、状态或说明的字段，防止同一字段重复出现。 */
  const used = new Set<FieldKey<M>>();
  /** 从字段列表按 key 取出摘要字段并标记已使用，避免标题、状态和正文重复显示同一项。 */
  function take(key: FieldKey<M> | undefined) {
    if (key === undefined || used.has(key)) return undefined;
    const entry = visible.find((item) => item.field.key === key);
    if (!entry) return undefined;
    used.add(key);
    return entry.field;
  }
  /** 页头主要标题字段，未配置或不可见时交给组件显示默认标题。 */
  const title = take(summary?.titleField);
  /** 页头状态标签字段，按配置顺序收集并过滤重复或不存在的字段。 */
  const status = (summary?.statusFields ?? []).flatMap((key) => {
    const field = take(key);
    return field ? [field] : [];
  });
  /** 页头辅助说明字段，去掉已经用作标题或状态的项。 */
  const description = (summary?.descriptionFields ?? []).flatMap((key) => {
    const field = take(key);
    return field ? [field] : [];
  });
  // 分组标题附着在组首字段；提取组首后把标题传给下一资料字段。
  let pendingGroup = "";
  /** 留在正文中的字段，保持原顺序并接续被提取字段原来的分组标题。 */
  const remaining: FieldDefinition<M, C>[] = [];
  for (const field of fields) {
    if (!field.detail) continue;
    /** 当前字段声明的分组标题，提取摘要后需要传递给下一个正文项。 */
    const group = typeof field.detail === "object" ? field.detail.group : undefined;
    if (group) pendingGroup = group;
    if (used.has(field.key)) continue;
    /** 复制正文配置后再补分组，不修改业务模块共享的字段对象。 */
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
