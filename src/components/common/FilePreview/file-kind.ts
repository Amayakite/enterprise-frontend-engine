import type { FilePreviewItem } from "./types";

/**
 * 过滤附件字段的运行时值，避免畸形 DTO 进入文件读取流程。
 * @param value 表单或详情字段原始值。
 * @returns 仅包含字符串 name/url 的附件列表；不修改输入。
 * @example
 * `const files = toPreviewFiles(model.attachments)`
 */
export function toPreviewFiles(value: unknown): FilePreviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (file): file is FilePreviewItem =>
      !!file &&
      typeof file === "object" &&
      "name" in file &&
      typeof file.name === "string" &&
      "url" in file &&
      typeof file.url === "string"
  );
}
