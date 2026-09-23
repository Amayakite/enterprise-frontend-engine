<template>
  <div class="dict-select" :style="style">
    <el-select
      v-if="type === 'select'"
      :model-value="scalarValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :loading="loading"
      clearable
      @change="change"
    >
      <el-option
        v-for="option in options"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
    <el-radio-group
      v-else-if="type === 'radio'"
      :model-value="scalarValue"
      :disabled="disabled"
      @change="change"
    >
      <el-radio v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </el-radio>
    </el-radio-group>
    <el-checkbox-group v-else :model-value="arrayValue" :disabled="disabled" @change="change">
      <el-checkbox v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </el-checkbox>
    </el-checkbox-group>
    <el-text v-if="error" type="danger" size="small">
      字典加载失败
      <el-button link type="primary" @click="reload">重试</el-button>
    </el-text>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useDictionary } from "@/composables/useDictionary";
const props = withDefaults(
  defineProps<{
    /** 字典编码，用于加载选项。 */
    code: string;
    /** 已选字典值（v-model）；多选时传数组。 */
    modelValue?: string | number | null | (string | number)[];
    /** 渲染方式，默认 select。 */
    type?: "select" | "radio" | "checkbox";
    /** 未选择时的输入提示，默认“请选择”。 */
    placeholder?: string;
    /** 是否禁止选择。 */
    disabled?: boolean;
    /** 控件的行内样式，默认宽度 300px。 */
    style?: CSSProperties;
  }>(),
  { type: "select", placeholder: "请选择", disabled: false, style: () => ({ width: "300px" }) }
);
const emit = defineEmits<{
  /**
   * 已选字典值变更；无选择时回传 undefined，多选时回传值数组。
   * @example `<DictSelect v-model="form.status" code="customer_status" />`
   */
  "update:modelValue": [value: string | number | (string | number)[] | undefined];
}>();
/** 读取字典选项及加载错误，多个相同字典组件可复用公共请求。 */
const { options, loading, error, reload } = useDictionary(() => props.code);
// 字典协议沿用数字/字符串编码兼容，不将这条规则用于业务 ID。
const scalarValue = computed(() =>
  props.modelValue === null || props.modelValue === undefined || Array.isArray(props.modelValue)
    ? undefined
    : options.value.find((option) => String(option.value) === String(props.modelValue))?.value
);
/** 多选控件只接收数组，未选或单值时按空集合显示。 */
const arrayValue = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));
/** 整理选择控件的结果后通知父页面，单选和多选保持各自约定的值形状。 */
function change(value: unknown) {
  if (Array.isArray(value))
    emit(
      "update:modelValue",
      value.filter(
        (item): item is string | number => typeof item === "string" || typeof item === "number"
      )
    );
  else
    emit(
      "update:modelValue",
      typeof value === "string" || typeof value === "number" ? value : undefined
    );
}
</script>

<style scoped lang="scss">
.dict-select {
  max-width: 100%;
  .el-select {
    width: 100%;
  }
}
</style>
