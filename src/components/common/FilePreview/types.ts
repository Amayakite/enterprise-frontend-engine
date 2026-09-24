/** 预览文件描述；服务端附件传 name/url，本地试阅传 name/blob，不写入业务模型。 */
export interface FilePreviewItem {
  /** 显示及格式识别使用的原始文件名；签名 URL 无后缀时仍需保留扩展名。
   * @example
   * `name: "合同.docx"`
   */
  name: string;
  /** HTTP(S) 或站内绝对路径；与 blob 至少传一个，同时传时优先使用 blob。 */
  url?: string;
  /** 已读取的文件内容或本地 File；省略时读取 url，不会自动上传。 */
  blob?: Blob;
}

/** 附件预览弹窗参数；图片与文档统一使用 open-file-viewer。 */
export interface FilePreviewDialogProps {
  /** 当前字段的文件组；只读使用，按原顺序切换图片和文档。 */
  files: readonly FilePreviewItem[];
  /** 打开时的文件索引，从 0 开始；默认 0，超出范围显示文件不存在提示。 */
  initialIndex?: number;
}

/** 嵌入式文档预览参数；远程读取与认证由调用方处理。 */
export interface FilePreviewProps {
  /** 已读取的文件内容；组件只预览，不修改也不上传。 */
  blob: Blob;
  /** 原始文件名，必须保留扩展名，例如“明细.xlsx”。 */
  name: string;
}

/** 文档预览事件；错误交给外层统一呈现并保留下载入口。 */
export interface FilePreviewEmits {
  /** 解析失败或格式不支持时触发，message 为用户可读说明。
   * @example
   * `<FilePreview @error="showPreviewError" ... />`
   */
  error: [message: string];
}

/** 上传列表与只读字段共用的附件条目；仅展示与发出操作事件。 */
export interface FileAttachmentProps {
  /** 原始文件名，用于显示及识别类型图标；长名称自动换行。 */
  name: string;
  /** 是否正在上传；默认 false，为 true 时禁用预览并以进度替代操作。 */
  pending?: boolean;
  /** 上传进度，0–100；默认 0，仅 pending 为 true 时显示。 */
  progress?: number;
  /** 是否显示删除入口；默认 false，只读场景省略。 */
  removable?: boolean;
  /** 删除请求进行中；默认 false，为 true 时阻止重复删除。 */
  removing?: boolean;
}

/** 附件操作事件；网络请求与模型更新由调用方负责。 */
export interface FileAttachmentEmits {
  /** 点击文件名或类型图标时触发，无参数；调用方打开对应附件预览。
   * @example
   * `<FileAttachment @preview="openPreview" ... />`
   */
  preview: [];
  /** 点击下载时触发，无参数；调用方下载原文件。
   * @example
   * `<FileAttachment @download="downloadFile" ... />`
   */
  download: [];
  /** 点击删除时触发，无参数；调用方删除成功后更新列表。
   * @example
   * `<FileAttachment @remove="removeFile" ... />`
   */
  remove: [];
}
