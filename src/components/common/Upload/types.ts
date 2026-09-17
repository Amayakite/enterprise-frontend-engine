import type { CSSProperties } from "vue";

/** 上传组件的额外表单值；数字和布尔值按字符串传输，文件保持 Blob。 */
export type UploadData = Record<string, string | number | boolean | Blob>;

/** 单图、多图、附件共用的上传约束；只检查文件元信息，不解析文件内容。 */
export interface UploadOptions {
  /** 附加的 multipart 字段；省略为空，不修改传入对象。 */
  data?: UploadData;
  /** 文件字段名；默认 file，不能为空。
   * @example
   * `name: "attachment"`
   */
  name?: string;
  /** 单文件大小上限，单位 MiB；默认 10，必须大于 0。 */
  maxFileSize?: number;
  /** 扩展名或 MIME，逗号分隔；附件默认通配符，图片默认 image/*。空串或全部类型通配符不限制。
   * @example
   * `accept: ".pdf,.xlsx"`
   */
  accept?: string;
}

/** 多文件上传的公开配置；结果通过 v-model 回传。 */
export interface FileUploadProps extends UploadOptions {
  /** 最多保留的文件数，包含正在上传的文件；默认 10。 */
  limit?: number;
  /** 上传按钮文案；默认“上传文件”。 */
  uploadBtnText?: string;
  /** 外层容器样式；默认宽度 300px，窄屏最多占满容器。 */
  style?: CSSProperties;
}

/** 单图上传的公开配置；空字符串表示尚未上传。 */
export interface SingleImageUploadProps extends UploadOptions {
  /** 图片区域样式；默认宽高 150px，不依赖 Element Plus 私有节点。 */
  style?: CSSProperties;
}

/** 多图上传的公开配置；URL 数组仅包含成功上传的图片。 */
export interface MultiImageUploadProps extends UploadOptions {
  /** 最多保留的图片数，包含正在上传的图片；默认 10。 */
  limit?: number;
}
