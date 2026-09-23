<template>
  <el-form v-if="fields.length" inline class="reference-search-fields" @submit.prevent>
    <el-form-item v-for="field in fields" :key="field.key" :label="field.label">
      <el-input
        v-if="field.type === 'text'"
        :model-value="textValue(field.key)"
        :aria-label="`筛选${field.label}`"
        clearable
        @update:model-value="set(field.key, $event)"
      />
      <el-select
        v-else-if="field.type === 'select'"
        :model-value="selectValue(field.key)"
        :aria-label="`筛选${field.label}`"
        clearable
        @update:model-value="set(field.key, $event === undefined ? null : $event)"
      >
        <el-option
          v-for="option in field.options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <el-date-picker
        v-else
        :model-value="dateValue(field.key)"
        type="daterange"
        value-format="YYYY-MM-DD"
        :aria-label="`筛选${field.label}`"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        @update:model-value="setDates(field.key, $event)"
      />
    </el-form-item>
  </el-form>
</template>
<script setup lang="ts">
import type { QueryValue, ReferenceSearchField } from "./types";
const props = defineProps<{
  /**
   * 参照数据源声明的可筛选字段。
   * @example `<ReferenceSearchFields :fields="source.searchFields ?? []" ... />`
   */
  fields: readonly ReferenceSearchField[];
  /**
   * 当前筛选条件（v-model），键为字段 key。
   * @example `<ReferenceSearchFields v-model="filters" ... />`
   */
  modelValue: Record<string, QueryValue>;
}>();
const emit = defineEmits<{
  /**
   * 参照弹窗内的筛选条件变更；键为 ReferenceSearchField.key。
   * @example `<ReferenceSearchFields v-model="filters" :fields="source.searchFields" />`
   */
  "update:modelValue": [value: Record<string, QueryValue>];
}>();
/** 把条件值限制为文本/数字输入可用的类型，未填写时返回空值。 */
function textValue(key: string) {
  const value = props.modelValue[key];
  return typeof value === "string" ? value : "";
}
/** 读取可供选择控件使用的条件值，避免直接传入不兼容对象。 */
function selectValue(key: string) {
  const value = props.modelValue[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;
}
/** 仅接受完整的日期区间，其他值转为空区间。 */
function dateValue(key: string): [string, string] | null {
  const value = props.modelValue[key];
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
    ? [value[0], value[1]]
    : null;
}
/** 复制条件对象并修改指定字段，通过事件回写查询草稿。 */
function set(key: string, value: QueryValue) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
/** 整理日期控件的返回值，清空或无效范围按空条件处理。 */
function setDates(key: string, value: unknown) {
  set(
    key,
    Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "string")
      ? [value[0], value[1]]
      : null
  );
}
</script>
<style scoped lang="scss">
.reference-search-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
  :deep(.el-form-item) {
    margin-right: 0;
    max-width: 100%;
  }
  :deep(.el-input),
  :deep(.el-select) {
    width: 160px;
  }
  :deep(.el-date-editor) {
    max-width: 100%;
  }
}
</style>
