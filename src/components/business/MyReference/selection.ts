import { serializeStableKey } from "@/utils/identity";
import type { ReferenceId } from "./types";

/** 有序去重，不转换 ID 类型；同时拒绝非法运行时 ID。 */
export function referenceIds<Id extends ReferenceId>(value: Id | readonly Id[] | null): Id[] {
  /** 将单值、数组和 null 统一为内部 ID 数组，再校验类型、空值和重复项。 */
  const values = value === null ? [] : Array.isArray(value) ? value : [value as Id];
  for (const id of values) serializeStableKey(id);
  return [...new Set<Id>(values)];
}
/** 比较两次选择的 ID 集合；保留字符串/数字差异，不依赖行对象身份。 */
export function sameReferenceSelection<Id extends ReferenceId>(a: readonly Id[], b: readonly Id[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}
/** 候选增减、草稿勾选和当前页全选共用；超限整次拒绝，移除始终允许。 */
export function changeReferenceSelection<Id extends ReferenceId>(
  current: readonly Id[],
  changed: readonly Id[],
  selected: boolean,
  maximum = Infinity
) {
  /** 根据本次选择操作生成新的 ID 集合，避免直接修改父组件传入数组。 */
  const ids = selected
    ? referenceIds([...current, ...changed])
    : current.filter((id) => !changed.includes(id));
  /** 判断是否新增了 ID，仅新增时需要检查选择数量上限。 */
  const added = ids.some((id) => !current.includes(id));
  if (added && ids.length > maximum)
    return {
      ids: [...current],
      allowed: false,
      reason: `最多选择 ${maximum} 项，剩余 ${Math.max(0, maximum - current.length)} 项`,
    };
  return { ids, allowed: true };
}
