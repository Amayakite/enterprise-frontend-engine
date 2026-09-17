import { readonly, shallowRef } from "vue";
import { feedbackConfig } from "@/config/feedback";
import { summarizeFeedback, type FeedbackTone } from "./feedback-policy";

/** 全局轻提示的展示数据；不携带表单、路由或写入回调。 */
export interface FeedbackNotice {
  /** 单次呈现 ID；关闭句柄固定此 ID，不会关闭后来更新的提示。 */
  id: number;
  /** 结果严重度，不按文本长度推断。 */
  tone: FeedbackTone;
  /** 完整纯文本；摘要和详情由 MyFeedback 统一渲染。 */
  message: string;
}

const notices = shallowRef<readonly FeedbackNotice[]>([]);
/** FeedbackHost 唯一消费的只读轻提示列表，最多保留 maxVisible 条。 */
export const feedbackNotices = readonly(notices);
let sequence = 0;
const operations = new WeakMap<object, number>();
const lifetimes = new Map<
  number,
  {
    /** 自动关闭计时器，暂停/关闭时释放。 */
    timer?: ReturnType<typeof setTimeout>;
    /** 剩余展示毫秒数，0 表示用户关闭。 */
    remaining: number;
    /** 最近一次开始计时的时间。 */
    started: number;
    /** 悬停和键盘焦点各自计数，全部离开才恢复计时。 */
    pauses: Set<"hover" | "focus">;
    /** 本次操作归属，展示关闭即释放。 */
    operation?: object;
  }
>();

/** 关闭指定轻提示并释放计时器/操作归属；不存在的 ID 静默忽略。 */
export function closeFeedback(id: number) {
  const lifetime = lifetimes.get(id);
  if (!lifetime) return;
  clearTimeout(lifetime.timer);
  if (lifetime.operation && operations.get(lifetime.operation) === id)
    operations.delete(lifetime.operation);
  lifetimes.delete(id);
  notices.value = notices.value.filter((notice) => notice.id !== id);
}

function schedule(id: number) {
  const lifetime = lifetimes.get(id);
  if (!lifetime || lifetime.remaining <= 0 || lifetime.pauses.size) return;
  lifetime.started = Date.now();
  lifetime.timer = setTimeout(() => closeFeedback(id), lifetime.remaining);
}

/** 鼠标悬停或键盘焦点停留时暂停关闭；同一原因重复进入不重复扣减时间。 */
export function pauseFeedback(id: number, reason: "hover" | "focus") {
  const lifetime = lifetimes.get(id);
  if (!lifetime || lifetime.remaining <= 0) return;
  if (!lifetime.pauses.size) {
    clearTimeout(lifetime.timer);
    lifetime.remaining = Math.max(1, lifetime.remaining - (Date.now() - lifetime.started));
  }
  lifetime.pauses.add(reason);
}

/** 对应的悬停/焦点离开后续计时；其他暂停原因仍在时不自动关闭。 */
export function resumeFeedback(id: number, reason: "hover" | "focus") {
  const lifetime = lifetimes.get(id);
  if (!lifetime || !lifetime.pauses.delete(reason)) return;
  if (!lifetime.pauses.size) schedule(id);
}

/** 全局宿主销毁时清理展示及计时器，不触碰任何保存/草稿状态。 */
export function clearFeedback() {
  for (const id of lifetimes.keys()) closeFeedback(id);
}

/**
 * 发布到自有 FeedbackHost，不再调用 ElMessage / ElNotification。
 * @param tone 业务结果严重度；高风险状态应由当前页 MyFeedback 持久展示。
 * @param message 纯文本；长文不自动关闭，点击详情后使用 MyDialog 阅读。
 * @param operation 可选的单次操作对象；只替换同一操作的提示，不按文案跨页合并。
 * @returns 固定本次呈现的 close 句柄；可以重复关闭。
 * @example
 * `notifyFeedback("success", "客户资料已保存", operation)`
 */
export function notifyFeedback(tone: FeedbackTone, message: string, operation?: object) {
  if (operation) dismissFeedback(operation);
  const content = summarizeFeedback(
    message.trim() ||
      (tone === "success" ? feedbackConfig.messages.saved : feedbackConfig.messages.failed)
  );
  const limit = Math.max(1, Math.trunc(feedbackConfig.maxVisible) || 1);
  while (notices.value.length >= limit) closeFeedback(notices.value[0]!.id);
  const id = ++sequence;
  const duration = content.detailed
    ? 0
    : tone === "success"
      ? feedbackConfig.successDuration
      : feedbackConfig.noticeDuration;
  lifetimes.set(id, { remaining: duration, started: Date.now(), pauses: new Set(), operation });
  if (operation) operations.set(operation, id);
  notices.value = [...notices.value, { id, tone, message: content.text }];
  schedule(id);
  return { close: () => closeFeedback(id) };
}

/** 撤回本次操作的提示；移除其组件也会关闭所属详情，不影响其他页面提示。 */
export function dismissFeedback(operation: object) {
  const id = operations.get(operation);
  if (id !== undefined) closeFeedback(id);
}

/** 统一轻提示入口；需要用户决定的确认仍保留原确认流程。
 * @example
 * `feedback.success("保存成功")`
 */
export const feedback = {
  /** 已完成，默认 2.6 秒后消失；悬停和焦点停留时暂停。 */
  success: (message: string) => notifyFeedback("success", message),
  /** 普通说明，不阻断操作。 */
  info: (message: string) => notifyFeedback("info", message),
  /** 警告，不附加自动重试写入。 */
  warning: (message: string) => notifyFeedback("warning", message),
  /** 失败反馈；当前页可恢复错误优先使用内联 MyFeedback。 */
  error: (message: string) => notifyFeedback("error", message),
};

if (import.meta.hot) import.meta.hot.dispose(clearFeedback);
