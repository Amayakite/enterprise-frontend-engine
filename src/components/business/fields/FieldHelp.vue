<template>
  <p v-if="text" class="field-help">{{ text }}</p>
</template>
<script setup lang="ts" generic="M extends object, C">
import { fieldHelpText } from "./presentation";
import type { FieldDefinition, FieldEnvironment } from "./types";
const props = defineProps<{
  /**
   * 字段合同，用于读取动态帮助文案。
   * @example `<FieldHelp :field="field" ... />`
   */
  field: FieldDefinition<M, C>;
  /**
   * 当前模型和页面上下文。
   * @example `<FieldHelp :env="env" ... />`
   */
  env: FieldEnvironment<M, C>;
  /**
   * 是否按只读状态计算帮助文案。
   * @example `<FieldHelp :readonly="true" ... />`
   */
  readonly?: boolean;
}>();
const text = computed(() => fieldHelpText(props.field, props.env, props.readonly));
</script>
<style scoped lang="scss">
.field-help {
  width: 100%;
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
