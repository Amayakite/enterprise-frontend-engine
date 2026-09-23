<template>
  <Teleport to="body">
    <TransitionGroup
      name="feedback-toast"
      tag="div"
      class="feedback-host"
      aria-label="操作反馈"
      :style="{
        '--feedback-top': `max(${feedbackConfig.offset}px, env(safe-area-inset-top))`,
        zIndex,
      }"
    >
      <MyFeedback
        v-for="notice in feedbackNotices"
        :key="notice.id"
        :message="notice.message"
        :tone="notice.tone"
        variant="floating"
        closable
        @close="closeFeedback(notice.id)"
        @mouseenter="pauseFeedback(notice.id, 'hover')"
        @mouseleave="resumeFeedback(notice.id, 'hover')"
        @focusin="pauseFeedback(notice.id, 'focus')"
        @focusout="onFocusOut(notice.id, $event)"
      />
    </TransitionGroup>
  </Teleport>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useZIndex } from "element-plus";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { feedbackConfig } from "@/config/feedback";
import {
  feedbackNotices,
  closeFeedback,
  clearFeedback,
  pauseFeedback,
  resumeFeedback,
} from "@/utils/feedback";
/** 使用项目弹层层级分配，让全局反馈显示在普通页面之上。 */
const { nextZIndex } = useZIndex();
/** 当前反馈浮层使用的层级，有新提示时可提升到最新弹层上方。 */
const zIndex = ref(2000);
/** 反馈队列变化时调整浮层层级，让新消息不会被其他弹窗遮住。 */
watch(
  feedbackNotices,
  (current, previous) => {
    if (current.some((notice) => !previous?.some((old) => old.id === notice.id)))
      zIndex.value = nextZIndex();
  },
  { immediate: true, flush: "sync" }
);
/** 焦点真正离开当前提示后才恢复自动关闭，提示内切换按钮不重启计时。 */
function onFocusOut(id: number, event: FocusEvent) {
  if (
    event.currentTarget instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  )
    return;
  resumeFeedback(id, "focus");
}
/** 反馈容器卸载时清空消息和自动关闭计时器。 */
onBeforeUnmount(clearFeedback);
</script>
<style scoped>
.feedback-host {
  position: fixed;
  top: var(--feedback-top);
  inset-inline: 16px;
  max-height: calc(100dvh - var(--feedback-top) - 16px);
  padding: 4px 12px 16px;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.feedback-host > * {
  pointer-events: auto;
}
.feedback-toast-enter-active,
.feedback-toast-leave-active,
.feedback-toast-move {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.feedback-toast-enter-from,
.feedback-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (prefers-reduced-motion: reduce) {
  .feedback-toast-enter-active,
  .feedback-toast-leave-active,
  .feedback-toast-move {
    transition: none;
  }
}
</style>
