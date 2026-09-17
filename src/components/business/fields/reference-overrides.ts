import type { FieldDefinition, FieldKey, FieldReference } from "./types";

/** 按页面模型字段值约束实例覆盖；字段是否为 reference 在运行时复核。 */
export type ReferenceOverrides<M, C> = {
  /** 仅覆盖对应字段的参照定义，省略保留共享配置。 */
  [K in FieldKey<M>]?: FieldReference<M[K], M, C>;
};

/** 为当前实例复制被覆盖字段；不修改模块编译缓存，其他字段保持原引用。
 * @param fields 已编译主表字段。
 * @param overrides 按字段 key 提供的参照定义；未传不分配数组。
 * @returns 实例字段；错误 key 或非参照字段抛错。
 * @example
 * `applyReferenceOverrides(fields, { provinceId: province.withMap(localMap) })`
 */
export function applyReferenceOverrides<M, C>(
  fields: readonly FieldDefinition<M, C>[],
  overrides?: ReferenceOverrides<M, C>
): readonly FieldDefinition<M, C>[] {
  if (!overrides) return fields;
  for (const key of Object.keys(overrides)) {
    if (!fields.some((field) => field.key === key && field.type === "reference"))
      throw new Error(`不能覆盖非参照字段：${key}`);
  }
  return fields.map((field) => {
    const reference = overrides[field.key];
    if (!reference || field.type !== "reference") return field;
    const copy = { ...field };
    if (copy.type === "reference") copy.reference = reference;
    return copy;
  });
}
