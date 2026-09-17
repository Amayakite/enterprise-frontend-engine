/**
 * 搜索文本规范化：null/undefined 视为空，忽略两端空白及大小写。
 * 不做 Unicode 归一化、拼音或内部空白合并；不得用于 ID/身份比较。
 */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
