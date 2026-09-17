import request from "@/utils/request";
import type { FileInfo } from "./types";
import { downloadFile } from "@/utils/download";

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

  /** 下载文件 */
  download(url: string, fileName?: string) {
    return request({
      url,
      method: "get",
      responseType: "blob",
    }).then((res) => downloadFile(res, fileName));
  },
};

export default FileAPI;

// 重导出类型
export * from "./types";
