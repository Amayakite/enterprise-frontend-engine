/** 展示类别只决定图标与配色，不参与预览格式判断。 */
export type FileCategory =
  | "word"
  | "sheet"
  | "slides"
  | "pdf"
  | "image"
  | "archive"
  | "video"
  | "audio"
  | "text"
  | "other";

/** 附件条目的类型提示。 */
export interface FileAppearance {
  /** 图标及颜色类别，未知后缀使用 other。 */
  kind: FileCategory;
  /** 面向用户的中文类型名称。 */
  label: string;
  /** 大写扩展名；无扩展名或超过 10 字符时为空。 */
  extension: string;
}

/** 已知扩展名按类别归组，不下载文件也不尝试内容解析。 */
const categories: readonly [FileCategory, string, readonly string[]][] = [
  ["word", "Word 文档", ["doc", "docx", "docm", "dot", "dotx", "rtf", "odt"]],
  ["sheet", "电子表格", ["xls", "xlsx", "xlsm", "csv", "ods"]],
  ["slides", "演示文稿", ["ppt", "pptx", "pptm", "odp"]],
  ["pdf", "PDF 文档", ["pdf"]],
  [
    "image",
    "图片",
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "heic", "tif", "tiff"],
  ],
  ["archive", "压缩文件", ["zip", "rar", "7z", "gz", "tar", "bz2", "xz"]],
  ["video", "视频", ["mp4", "mov", "avi", "mkv", "webm"]],
  ["audio", "音频", ["mp3", "wav", "flac", "m4a", "ogg", "aac"]],
  ["text", "文本文件", ["txt", "md", "json", "xml", "log", "yaml", "yml"]],
];

/**
 * 根据文件名生成附件图标和格式提示，未知类型回退为通用文件。
 * @param name 原始文件名；空名、无后缀及隐藏文件不显示扩展名。
 * @returns 展示类别、中文名称和大写扩展名，不代表格式可预览。
 * @example
 * `getFileAppearance("销售明细.XLSX")`
 */
export function getFileAppearance(name: string): FileAppearance {
  const match = name.trim().match(/[^.]+\.([a-z0-9]{1,10})$/i);
  const extension = match?.[1].toLowerCase() ?? "";
  const category = categories.find(([, , extensions]) => extensions.includes(extension));
  return {
    kind: category?.[0] ?? "other",
    label: category?.[1] ?? "文件",
    extension: extension.toUpperCase(),
  };
}
