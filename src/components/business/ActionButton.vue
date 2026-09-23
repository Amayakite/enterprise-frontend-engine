<template>
  <el-tooltip :disabled="!disabledReason" :content="disabledReason" placement="top">
    <span
      class="action-button"
      :tabindex="disabledReason ? 0 : undefined"
      :aria-label="disabledReason ? `${label}：${disabledReason}` : undefined"
    >
      <el-button
        :type="tone === 'default' ? undefined : tone"
        :link="link"
        :icon="icon"
        :loading="loading"
        :disabled="disabled || !!disabledReason"
        @click="click"
      >
        {{ label }}
      </el-button>
    </span>
  </el-tooltip>
</template>
<script setup lang="ts">
import type { Component } from "vue";
const props = withDefaults(
  defineProps<{
    /**
     * 按钮可见文本。
     * @example `<ActionButton label="保存" />`
     */
    label: string;
    /**
     * 视觉语气，默认 default。
     * @example `<ActionButton tone="danger" />`
     */
    tone?: "primary" | "danger" | "default";
    /**
     * 是否采用文字链接样式，默认 true。
     * @example `<ActionButton :link="false" />`
     */
    link?: boolean;
    /**
     * 是否禁用按钮。
     * @example `<ActionButton :disabled="formInvalid" />`
     */
    disabled?: boolean;
    /**
     * 禁用原因；有值时按钮不可点击并供用户查看。
     * @example `<ActionButton disabled-reason="无操作权限" />`
     */
    disabledReason?: string;
    /**
     * 是否显示加载状态并阻止重复点击。
     * @example `<ActionButton :loading="saving" />`
     */
    loading?: boolean;
    /**
     * Element Plus 图标组件。
     * @example `<ActionButton :icon="Plus" />`
     */
    icon?: Component;
  }>(),
  { tone: "default", link: true }
);
const emit = defineEmits<{
  /**
   * 用户点击可用操作按钮；disabled、disabledReason 或 loading 时不会触发。
   * @example `<ActionButton label="提交" @click="submit" />`
   */
  click: [];
}>();
/** 只有可操作时才通知点击；禁用时保留原因提示而不执行业务操作。 */
function click() {
  if (!props.disabled && !props.disabledReason && !props.loading) emit("click");
}
</script>
<style scoped lang="scss">
.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  min-height: 24px;
  line-height: 1;
}
.action-button :deep(.el-button) {
  margin: 0;
}
.action-button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  border-radius: 3px;
}
</style>
