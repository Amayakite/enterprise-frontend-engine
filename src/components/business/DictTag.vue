<template>
  <span v-if="error" class="dict-tag-error">
    {{ modelValue ?? "—" }}（字典加载失败）
    <el-button link @click="reload">重试</el-button>
  </span>
  <el-tag v-else-if="item?.tagType" :type="tagType" :size="size">{{ item.label }}</el-tag>
  <span v-else>
    {{ item?.label ?? (loading ? "加载中…" : modelValue == null ? "—" : `未知值：${modelValue}`) }}
  </span>
</template>

<script setup lang="ts">
import { useDictionary } from "@/composables/useDictionary";
const props = withDefaults(
  defineProps<{
    /**
     * 字典编码；未传时显示空值。
     * @example `<DictTag code="customer_status" />`
     */
    code?: string;
    /**
     * 要展示的字典值。
     * @example `<DictTag code="customer_status" :model-value="row.status" />`
     */
    modelValue?: string | number | null;
    /**
     * 标签尺寸，默认 default。
     * @example `<DictTag size="small" />`
     */
    size?: "default" | "large" | "small";
  }>(),
  { size: "default" }
);
const { options, loading, error, reload } = useDictionary(() => props.code);
const item = computed(() =>
  props.modelValue === null || props.modelValue === undefined
    ? undefined
    : options.value.find((option) => String(option.value) === String(props.modelValue))
);
const tagType = computed(() => {
  const value = item.value?.tagType;
  return value === "success" ||
    value === "warning" ||
    value === "info" ||
    value === "primary" ||
    value === "danger"
    ? value
    : undefined;
});
</script>

<style scoped lang="scss">
.dict-tag-error {
  color: var(--el-color-danger);
}
</style>
