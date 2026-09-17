<template>
  <span class="field-label">
    <span v-if="required" class="field-label__required" aria-label="必填">*</span>
    <span>{{ label }}</span>
    <el-tooltip v-if="help" :content="help" placement="top" :show-after="250">
      <button class="field-label__help" type="button" :aria-label="`${label}填写说明：${help}`">
        <el-icon><QuestionFilled /></el-icon>
      </button>
    </el-tooltip>
  </span>
</template>
<script setup lang="ts">
import { QuestionFilled } from "@element-plus/icons-vue";
defineProps<{
  /**
   * 字段显示名称。
   * @example `<FieldLabel label="客户名称" />`
   */
  label: string;
  /**
   * 是否显示必填星号。
   * @example `<FieldLabel label="客户名称" required />`
   */
  required?: boolean;
  /**
   * 悬停问号图标时显示的补充说明。
   * @example `<FieldLabel label="税号" help="统一社会信用代码" />`
   */
  help?: string;
}>();
</script>
<style scoped lang="scss">
.field-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  vertical-align: middle;
}
.field-label__required {
  color: var(--el-color-danger);
}
.field-label__help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: help;
}
.field-label__help:focus-visible {
  outline: 2px solid var(--el-color-primary);
  border-radius: 2px;
}
</style>
