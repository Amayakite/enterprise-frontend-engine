/** Word 试用组件输入；替换文件时由父组件通过 key 重建实例，避免异步导入互相覆盖。 */
export interface WordEditorProps {
  /** 本地或文件 API 读取的 DOCX 字节；只读使用，不会上传。 */
  document: ArrayBuffer;
  /** 原始文件名，用于编辑器标题。 */
  name: string;
}

/** 适配器事件；错误呈现和未导出提醒由宿主页面处理。 */
export interface WordEditorEmits {
  /** 导入完成后触发，此前禁止插入变量与导出。
   * @example
   * `<EigenPalEditor @ready="onReady" ... />`
   */
  ready: [];
  /** 文档修改时触发；不传整个文档，导出时才序列化。
   * @example
   * `<EigenPalEditor @change="onChange" ... />`
   */
  change: [];
  /** 导入或运行失败时触发，message 为错误说明；宿主保留原文件供重试。
   * @example
   * `<EigenPalEditor @error="onError" ... />`
   */
  error: [message: string];
}

/** 导出结果；部分上游插件同时触发浏览器下载，宿主不能重复下载。 */
export interface WordExportResult {
  /** 可用于预览、上传或下载的 DOCX；本组件不执行后端写入。 */
  blob: Blob;
  /** true 表示编辑器已触发下载；false 时由宿主调用 downloadFile。 */
  downloadStarted: boolean;
}

/** 两个 Word 适配器共用的公开操作；只在 ready 后调用。 */
export interface WordEditorHandle {
  /** 在当前光标处插入普通文本；例如 [[甲方名称]]，不赋予后端替换或签章语义。
   * @throws 未就绪或当前位置不可编辑时抛错，由宿主统一提示。
   * @example
   * `editor.insertVariable('[[甲方名称]]')`
   */
  insertVariable: (text: string) => void;
  /** 序列化当前文档，name 需包含 .docx 后缀；失败保留编辑内容。
   * @remarks canvas-editor 的官方插件会同时下载文件；检查返回的 downloadStarted。
   * @example
   * `const result = await editor.exportDocx('合同.docx')`
   */
  exportDocx: (name: string) => Promise<WordExportResult>;
}
