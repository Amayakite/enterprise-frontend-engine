import type { FeedbackTone } from "@/utils/feedback-policy";

/** 页内与全局轻提示共用的呈现合同；不拥有保存或重试状态。 */
export interface FeedbackProps {
  /** 完整纯文本；超出统一阈值显示摘要，通过详情阅读，不执行 HTML。 */
  message: string;
  /** 业务严重度，默认 info；不按文本长度改变严重度。 */
  tone?: FeedbackTone;
  /** 下一步说明，省略不展示；真实操作由默认插槽提供。 */
  nextStep?: string;
  /** inline 默认嵌入页面；floating 由 FeedbackHost 居中浮动，不由业务页自行定位。 */
  variant?: "inline" | "floating";
  /** 默认 false；true 展示关闭按钮，只发事件，不修改业务状态。
   * @example
   * `<MyFeedback message="保存成功" tone="success" closable @close="dismiss" />`
   */
  closable?: boolean;
}

/** 反馈只提供展示事件，不自动重新执行业务命令。 */
export interface FeedbackEmits {
  /** 点击关闭触发；宿主负责移除本次展示，不清除表单或错误事实。
   * @example
   * `<MyFeedback closable message="保存成功" @close="dismiss" />`
   */
  close: [];
}
