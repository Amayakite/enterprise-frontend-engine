import request from "@/utils/request";
import type { FileInfo } from "./types";
import { downloadFile } from "@/utils/download";
import { resolveFileUrl } from "./url";

const FileAPI = {
  /**
   * 上传文件，沿用当前 Mock 的 multipart 协议。
   * @param formData 文件和附加字段；不修改传入对象。
   * @param onProgress 上传字节进度，0–100；省略不通知，不表示服务端处理完成。
   * @param signal 可选取消信号；取消不保证后端撤回已接收文件。
   * @returns 当前文件 API 的名称和 URL。
   * @example
   * `FileAPI.upload(formData, undefined, controller.signal)`
   */
  upload(formData: FormData, onProgress?: (percent: number) => void, signal?: AbortSignal) {
    return request<unknown, FileInfo>({
      url: "/api/v1/files",
      method: "post",
      data: formData,
      signal,
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress?.(percent);
        }
      },
    });
  },

  /**
   * 上传单个 File，复用统一 multipart 传输。
   * @param file 当前文件，不修改其内容。
   * @param signal 可选取消信号；取消不能撤回服务端已接收的数据。
   * @returns 当前文件 API 的名称和 URL，仍遵循开发 Mock 协议。
   * @example
   * `FileAPI.uploadFile(file, controller.signal)`
   */
  uploadFile(file: File, signal?: AbortSignal): Promise<FileInfo> {
    const formData = new FormData();
    formData.append("file", file);
    return FileAPI.upload(formData, undefined, signal);
  },

  /** 删除文件 */
  delete(filePath?: string) {
    return request({
      url: "/api/v1/files",
      method: "delete",
      params: { filePath },
    });
  },

  /**
   * 读取附件原始字节，供预览与下载复用；不触发保存到磁盘。
   * @param url 站内绝对路径或 HTTP(S) 地址；站内及配置的 API 域使用现有认证，外域不携带 Token/Cookie。
   * @param signal 可选取消信号，关闭预览时传入以终止旧读取。
   * @returns 保留响应头的 Blob 响应；外域需要服务器允许 CORS。
   * @remarks 不缓存文件；错误由预览或下载调用方展示，不重复全局提示。
   * @example
   * `const response = await FileAPI.read(file.url, controller.signal)`
   */
  async read(url: string, signal?: AbortSignal) {
    const target = resolveFileUrl(url, window.location.origin, import.meta.env.VITE_APP_BASE_API);
    if (target.authenticated) {
      return request({
        url,
        method: "get",
        responseType: "blob",
        signal,
        errorPresentation: "local",
      });
    }
    const response = await fetch(target.url, {
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error(`文件读取失败（HTTP ${response.status}）`);
    return {
      data: await response.blob(),
      headers: { "content-disposition": response.headers.get("content-disposition") },
    };
  },

  /** 下载原文件，读取策略与预览一致；错误由调用方提示。 */
  download(url: string, fileName?: string) {
    return FileAPI.read(url).then((res) => downloadFile(res, fileName));
  },
};

export default FileAPI;

// 重导出类型
export * from "./types";
