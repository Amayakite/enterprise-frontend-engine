import type { AxiosResponse } from "axios";

/** 二进制下载输入；保留响应头以读取服务器文件名，不接受未验证的任意对象。 */
export type DownloadResponse = Pick<AxiosResponse<Blob | ArrayBuffer>, "data" | "headers">;

/**
 * 从响应头中提取文件名
 * @param contentDisposition Content-Disposition 响应头
 * @returns 解码后的文件名
 */
function extractFileName(contentDisposition: string): string {
  if (!contentDisposition) {
    return `download_${Date.now()}`;
  }

  // 尝试从 filename*=UTF-8'' 格式中提取
  const filenameRegex = /filename\*\s*=\s*UTF-8''([^;]+)/i;
  const matches = filenameRegex.exec(contentDisposition);
  if (matches && matches[1]) {
    try {
      return decodeURIComponent(matches[1].trim());
    } catch {
      /* 回退普通文件名。 */
    }
  }

  // 尝试从 filename= 格式中提取
  const fallbackRegex = /filename\s*=\s*("[^"]*"|[^;]+)/i;
  const fallbackMatches = fallbackRegex.exec(contentDisposition);
  if (fallbackMatches && fallbackMatches[1]) {
    const name = fallbackMatches[1].trim().replace(/^"|"$/g, "");
    try {
      return decodeURI(name);
    } catch {
      return name;
    }
  }

  return `download_${Date.now()}`;
}

/**
 * 下载文件
 * @param response Axios 响应对象
 * @param customFileName 自定义文件名（可选）
 * @throws 创建链接或触发下载失败时保留原异常；调用方使用统一 feedback 提示一次。
 *
 * @example
 * ```ts
 * // 基础用法
 * const response = await UserAPI.export(queryParams);
 * downloadFile(response);
 *
 * // 自定义文件名
 * downloadFile(response, "用户列表.xlsx");
 * ```
 */
export function downloadFile(response: DownloadResponse, customFileName?: string): void {
  let downloadUrl: string | undefined;
  let link: HTMLAnchorElement | undefined;
  try {
    const fileData = response.data;
    const contentDisposition = response.headers["content-disposition"];
    const fileName =
      customFileName ||
      extractFileName(typeof contentDisposition === "string" ? contentDisposition : "");

    // 创建 Blob 对象
    const blob = fileData instanceof Blob ? fileData : new Blob([fileData]);

    // 创建下载链接
    downloadUrl = window.URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;

    // 触发下载
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    if (downloadUrl) window.URL.revokeObjectURL(downloadUrl);
  }
}
