import { onBeforeUnmount } from "vue";
import { CanceledError } from "axios";
import type { UploadRawFile, UploadRequestOptions } from "element-plus";
import FileAPI from "@/api/file";
import type { UploadOptions } from "./types";

/**
 * 根据扩展名、MIME 和大小检查文件元信息；返回错误文案，null 表示可上传。
 * @param file 浏览器选择的文件；不会读取其内容。
 * @param options 组件公开约束；图片调用方应传入 image/*。
 * @returns 校验失败原因；后端仍负责文件内容与业务校验。
 * @example
 * `validateUpload(file, { accept: ".pdf", maxFileSize: 10 })`
 */
export function validateUpload(file: File, options: UploadOptions): string | null {
  const max = options.maxFileSize ?? 10;
  if (!Number.isFinite(max) || max <= 0) return "上传大小限制必须大于 0";
  const accept = (options.accept ?? "*").toLowerCase();
  const rules = accept
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const mime = file.type.toLowerCase();
  const allowed =
    rules.length === 0 ||
    rules.some((rule) => {
      if (rule === "*" || rule === "*/*") return true;
      if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
      if (rule.endsWith("/*")) return mime.startsWith(rule.slice(0, -1));
      return mime === rule;
    });
  if (!allowed) return `上传文件的格式不正确，仅支持 ${options.accept}`;
  if (file.size > max * 1024 * 1024) return `上传文件不能大于 ${max}M`;
  if (!(options.name ?? "file").trim()) return "上传文件字段名不能为空";
  return null;
}

/**
 * 三类上传控件共用请求取消与文件校验；模型重置和卸载后拒绝迟到结果。
 * @param options 获取当前组件上传配置，不修改配置或文件。
 * @param progress 上传字节进度回调；参数为文件 uid 和 0–100 百分比，不代表服务端处理完成。
 * @returns beforeUpload 供上传前检查，upload 供 http-request，reset 取消当前批次。
 * @remarks 沿用 FileAPI，不定义新接口；取消请求不代表后端撤回文件。
 * @example
 * `const uploader = useUpload(() => props);`
 */
export function useUpload(
  options: () => UploadOptions,
  progress?: (uid: number, percent: number) => void
) {
  const pending = new Set<AbortController>();
  let version = 0;
  function reset() {
    version++;
    pending.forEach((controller) => controller.abort());
    pending.clear();
  }
  function beforeUpload(file: UploadRawFile) {
    const error = validateUpload(file, options());
    if (error) ElMessage.warning(error);
    return error === null;
  }
  async function upload(request: UploadRequestOptions) {
    const current = version;
    const controller = new AbortController();
    pending.add(controller);
    const config = options();
    const formData = new FormData();
    formData.append(config.name ?? "file", request.file);
    for (const [key, value] of Object.entries(config.data ?? {})) {
      formData.append(key, value instanceof Blob ? value : String(value));
    }
    try {
      const result = await FileAPI.upload(
        formData,
        (percent) => {
          if (current === version) progress?.(request.file.uid, percent);
        },
        controller.signal
      );
      if (current !== version) throw new CanceledError("上传上下文已变化");
      return result;
    } finally {
      pending.delete(controller);
    }
  }
  onBeforeUnmount(reset);
  return { beforeUpload, upload, reset };
}
