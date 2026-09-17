<template>
  <div class="query-value" :data-kind="field.kind">
    <span v-if="operator === 'isEmpty' || operator === 'isNotEmpty'" class="query-value__empty">
      无需填写值
    </span>
    <component :is="customInput" v-else-if="field.input" />
    <el-date-picker
      v-else-if="field.kind === 'date' || field.kind === 'datetime'"
      :model-value="dateValue"
      :type="
        operator === 'between'
          ? field.kind === 'date'
            ? 'daterange'
            : 'datetimerange'
          : field.kind
      "
      :value-format="field.kind === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'"
      :aria-label="field.label"
      :placeholder="field.placeholder ?? '选择日期'"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      :disabled="disabled"
      @update:model-value="change"
    />
    <div v-else-if="operator === 'between'" class="query-value__range">
      <QueryValueInput
        :field="field"
        operator="eq"
        :model-value="range[0]"
        :disabled="disabled"
        @update:model-value="change([$event, range[1]])"
      />
      <span>至</span>
      <QueryValueInput
        :field="field"
        operator="eq"
        :model-value="range[1]"
        :disabled="disabled"
        @update:model-value="change([range[0], $event])"
      />
    </div>
    <DictSelect
      v-else-if="field.kind === 'enum' && field.dictionary"
      :code="field.dictionary.code"
      :type="multiple ? 'checkbox' : 'select'"
      :model-value="dictionaryValue"
      :style="{ width: '100%' }"
      :disabled="disabled"
      :aria-label="field.label"
      @update:model-value="dictionaryChange"
    />
    <el-select
      v-else-if="field.kind === 'enum' || field.kind === 'boolean' || multiple"
      :model-value="selectionValue"
      :multiple="multiple"
      :disabled="disabled"
      :aria-label="field.label"
      :placeholder="field.placeholder ?? '请选择'"
      clearable
      :filterable="field.kind === 'reference'"
      :allow-create="field.kind === 'reference'"
      default-first-option
      @update:model-value="selectionChange"
    >
      <el-option
        v-for="option in options"
        :key="`${typeof option.value}:${option.value}`"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
    <el-input-number
      v-else-if="
        field.kind === 'number' || (field.kind === 'reference' && field.valueType === 'number')
      "
      :model-value="numberValue"
      :aria-label="field.label"
      :disabled="disabled"
      :controls="false"
      :placeholder="field.placeholder ?? '请输入数字'"
      @update:model-value="change"
    />
    <el-input
      v-else
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      :aria-label="field.label"
      :disabled="disabled"
      :placeholder="field.placeholder ?? (field.kind === 'decimal' ? '例如 123.45' : '请输入')"
      clearable
      @update:model-value="change"
    >
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    </el-input>
  </div>
</template>
<script setup lang="ts">
import DictSelect from "@/components/business/DictSelect.vue";
import { inject } from "vue";
import { queryScopeKey } from "./context";
import type { QueryField } from "./types";
const props = defineProps<{
  /**
   * 当前条件的字段定义。
   * @example `<QueryValueInput :field="schema.status" ... />`
   */
  field: QueryField;
  /**
   * 当前条件操作符，决定单值、多值或范围输入。
   * @example `<QueryValueInput operator="between" ... />`
   */
  operator: string | null;
  /**
   * 当前条件原始值（v-model）。
   * @example `<QueryValueInput v-model="condition.value" ... />`
   */
  modelValue: unknown;
  /**
   * 是否禁止修改条件值。
   * @example `<QueryValueInput :disabled="loading" ... />`
   */
  disabled?: boolean;
}>();
defineSlots<{
  /**
   * 普通文本输入框尾部附加操作；不覆盖日期/枚举/自定义编辑器，默认无。
   * @example
   * `<QueryValueInput ...><template #suffix><el-button aria-label="查询" /></template></QueryValueInput>`
   */
  suffix?: () => unknown;
}>();
const emit = defineEmits<{
  /**
   * 当前操作符对应的原始输入值变更；范围操作符传双元素数组。
   * @example `<QueryValueInput v-model="condition.value" :field="field" :operator="condition.operator" />`
   */
  "update:modelValue": [value: unknown];
}>();
const inheritedScope = inject(queryScopeKey, undefined);
const multiple = computed(() => props.operator === "in" || props.operator === "notIn");
const range = computed<unknown[]>(() =>
  Array.isArray(props.modelValue) ? props.modelValue : [null, null]
);
const dateValue = computed(() =>
  typeof props.modelValue === "string" || Array.isArray(props.modelValue)
    ? (props.modelValue as string | string[])
    : null
);
const numberValue = computed(() =>
  typeof props.modelValue === "number" ? props.modelValue : undefined
);
const selectionValue = computed(() => {
  const value = props.modelValue;
  return Array.isArray(value)
    ? (value as (string | number)[])
    : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : undefined;
});
const options = computed(() =>
  props.field.kind === "enum"
    ? props.field.options
    : props.field.kind === "boolean"
      ? [
          { label: "是", value: true },
          { label: "否", value: false },
        ]
      : []
);
const dictionaryValue = computed(() =>
  typeof selectionValue.value === "boolean" ? undefined : selectionValue.value
);
function change(value: unknown) {
  if (!props.disabled) emit("update:modelValue", value ?? null);
}
function selectionChange(value: unknown) {
  if (
    props.field.kind === "reference" &&
    props.field.valueType === "number" &&
    Array.isArray(value)
  )
    change(value.map((item) => (typeof item === "number" ? item : Number(item))));
  else change(value);
}
function dictionaryChange(value: unknown) {
  if (props.field.kind !== "enum" || !props.field.dictionary) return;
  const type = props.field.dictionary.valueType;
  const decode = (item: unknown) => (type === "number" ? Number(item) : String(item));
  change(
    value === undefined || value === null
      ? null
      : Array.isArray(value)
        ? value.map(decode)
        : decode(value)
  );
}
function customInput() {
  return props.field.input!.render({
    value: props.modelValue,
    multiple: multiple.value,
    disabled: !!props.disabled,
    scopeKey: inheritedScope?.value,
    change,
  });
}
</script>
<style scoped lang="scss">
.query-value {
  min-width: 0;
  width: 100%;
}
.query-value :deep(.el-input-number),
.query-value :deep(.el-date-editor),
.query-value :deep(.el-select) {
  width: 100%;
  min-width: 0;
}
.query-value__range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.query-value__empty {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 480px) {
  .query-value :deep(.el-range-editor) {
    flex-wrap: wrap;
    height: auto;
    min-height: var(--el-component-size);
  }
  .query-value :deep(.el-range-input) {
    min-width: 90px;
  }
}
</style>
