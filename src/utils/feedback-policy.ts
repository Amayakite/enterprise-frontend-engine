import { feedbackConfig } from "../config/feedback";

/** 反馈严重度，由操作结果决定，不根据文本长度推断。 */
export type FeedbackTone = "success" | "info" | "warning" | "error";

/** 将长文本压缩为摘要；纯函数，不改写完整文本或执行 HTML。 */
export function summarizeFeedback(message: string) {
  const text = message.trim() || feedbackConfig.messages.failed;
  const lines = text.split(/\r?\n/);
  const detailed =
    text.length > feedbackConfig.summaryLength || lines.length > feedbackConfig.summaryLines;
  return {
    text,
    detailed,
    summary: detailed ? `${lines[0].slice(0, feedbackConfig.summaryLength)}…` : text,
  };
}
