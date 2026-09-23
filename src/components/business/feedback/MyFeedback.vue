<template>
  <section
    class="feedback"
    :class="[`feedback--${tone}`, `feedback--${variant}`]"
    :role="tone === 'error' || tone === 'warning' ? 'alert' : 'status'"
    aria-live="polite"
    aria-atomic="true"
  >
    <span class="feedback__icon" aria-hidden="true"><component :is="icon" /></span>
    <div class="feedback__content">
      <span class="feedback__summary">{{ content.summary }}</span>
      <span v-if="nextStep" class="feedback__next">{{ nextStep }}</span>
    </div>
    <button
      v-if="closable"
      type="button"
      class="feedback__close"
      aria-label="关闭提示"
      @click="emit('close')"
    >
      <Close aria-hidden="true" />
    </button>
    <div v-if="content.detailed || $slots.default" class="feedback__actions">
      <el-button v-if="content.detailed" link type="primary" @click="detailOpen = true">
        查看详情
      </el-button>
      <slot />
    </div>
    <MyDialog v-if="detailOpen" v-model="detailOpen" title="提示详情" width="min(720px, 92vw)">
      <pre class="feedback__detail">{{ content.text }}</pre>
      <template #footer><el-button @click="detailOpen = false">关闭</el-button></template>
    </MyDialog>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import MyDialog from "@/components/common/MyDialog.vue";
import { Check, Close, InfoFilled, WarningFilled } from "@element-plus/icons-vue";
import { summarizeFeedback } from "@/utils/feedback-policy";
import type { FeedbackProps, FeedbackEmits } from "./types";
const props = withDefaults(defineProps<FeedbackProps>(), {
  tone: "info",
  variant: "inline",
  closable: false,
});
const emit = defineEmits<FeedbackEmits>();
/** 根据提示级别选择对应图标，文字和颜色表达同一个结果。 */
const icon = computed(
  () => ({ success: Check, info: InfoFilled, warning: WarningFilled, error: Close })[props.tone]
);
/** 将长错误整理为简短摘要与可展开详情，避免一大段内容挤满页面。 */
const content = computed(() => summarizeFeedback(props.message));
/** 控制完整错误详情的展开状态，不改变原始错误内容。 */
const detailOpen = ref(false);
</script>
<style scoped>
.feedback {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 10px;
  padding: 10px 12px;
  border: 1px solid var(--feedback-border);
  border-radius: 8px;
  background: var(--feedback-bg);
  color: var(--el-text-color-primary);
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
}
.feedback--info {
  --feedback-color: var(--el-color-info);
  --feedback-bg: var(--el-color-info-light-9);
  --feedback-border: var(--el-color-info-light-8);
}
.feedback--success {
  --feedback-color: var(--el-color-success);
  --feedback-bg: var(--el-color-success-light-9);
  --feedback-border: var(--el-color-success-light-8);
}
.feedback--warning {
  --feedback-color: var(--el-color-warning);
  --feedback-bg: var(--el-color-warning-light-9);
  --feedback-border: var(--el-color-warning-light-8);
}
.feedback--error {
  --feedback-color: var(--el-color-danger);
  --feedback-bg: var(--el-color-danger-light-9);
  --feedback-border: var(--el-color-danger-light-8);
}
.feedback__content {
  grid-column: 2;
  min-width: 0;
}
.feedback__icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--feedback-color);
  background: var(--feedback-border);
  border-radius: 50%;
  align-self: start;
}
.feedback__icon svg {
  width: 15px;
  height: 15px;
}
.feedback__close {
  display: grid;
  place-items: center;
  grid-column: 3;
  grid-row: 1;
  width: 28px;
  height: 28px;
  margin: -2px -4px -2px 2px;
  padding: 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.feedback__close:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.feedback__close:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.feedback--floating {
  width: max-content;
  min-width: min(220px, 100%);
  max-width: min(520px, 100%);
  padding: 12px 16px;
  border-color: var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color-overlay);
  box-shadow: 0 4px 18px rgb(0 0 0 / 12%);
  font-size: 14px;
}
.feedback__summary {
  display: block;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.feedback__next {
  display: block;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}
.feedback__actions {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.feedback__detail {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
</style>
