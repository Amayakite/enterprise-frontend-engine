<template>
  <span v-if="formatted !== undefined">{{ formatted }}</span>
  <span v-else-if="isEmptyValue(value)">—</span>
  <component :is="referenceDisplay" v-else-if="field.type === 'reference'" />
  <template v-else-if="field.type === 'dict'">
    <DictTag
      v-for="(item, index) in dictValues"
      :key="index"
      :code="dictCode"
      :model-value="item"
    />
  </template>
  <div v-else-if="field.type === 'image' || field.type === 'images'" class="field-images">
    <el-image
      v-for="url in imageUrls"
      :key="url"
      :src="url"
      :preview-src-list="imageUrls"
      fit="cover"
      preview-teleported
    />
  </div>
  <div v-else-if="field.type === 'files'" class="field-files">
    <a
      v-for="file in files"
      :key="file.url"
      :href="safeUrl(file.url)"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ file.name }}
    </a>
  </div>
  <div
    v-else-if="
      field.type === 'rich' && field.props?.readonlyDisplay === 'html' && scene !== 'table'
    "
    class="field-rich-content"
    v-html="safeRichHtml"
  />
  <span v-else>{{ displayText }}</span>
</template>

<script setup lang="ts" generic="M extends object, C">
import { richTextContent, sanitizeRichText } from "./rich-text";
import DictTag from "@/components/business/DictTag.vue";
import { formatDate, formatDateTime, formatMonth, formatYear } from "@/utils/date";
import { formatMoney } from "@/utils/decimal";
import { isEmptyValue } from "@/utils/validate";
import type { FileInfo } from "@/api/file/types";
import type { FieldDefinition, FieldEnvironment } from "./types";
const props = defineProps<{
  /**
   * 字段合同，决定值的格式化和展示方式。
   * @example `<FieldDisplay :field="field" ... />`
   */
  field: FieldDefinition<M, C>;
  /**
   * 当前模型和页面上下文。
   * @example `<FieldDisplay :env="{ model: row, context, mode: 'edit' }" ... />`
   */
  env: FieldEnvironment<M, C>;
  /**
   * 展示场景；table 优先使用 table.format，detail 使用 detail.format。
   * @example `<FieldDisplay scene="table" ... />`
   */
  scene?: "detail" | "table";
}>();
const value = computed(() => props.env.model[props.field.key]);
const safeRichHtml = computed(() =>
  sanitizeRichText(typeof value.value === "string" ? value.value : "")
);
const formatted = computed(() =>
  props.scene === "table"
    ? props.field.table
      ? props.field.table.format?.(value.value, props.env)
      : undefined
    : typeof props.field.detail === "object"
      ? props.field.detail.format?.(value.value, props.env)
      : undefined
);
const dictCode = computed(() =>
  props.field.type === "dict"
    ? typeof props.field.dict.code === "function"
      ? props.field.dict.code(props.env)
      : props.field.dict.code
    : ""
);
const dictValues = computed(() =>
  (Array.isArray(value.value) ? value.value : [value.value]).filter(
    (item): item is string | number => typeof item === "string" || typeof item === "number"
  )
);
const imageUrls = computed(() =>
  (Array.isArray(value.value) ? value.value : [value.value]).filter(
    (item): item is string => typeof item === "string" && !!safeUrl(item)
  )
);
const files = computed(() => (Array.isArray(value.value) ? (value.value as FileInfo[]) : []));
function safeUrl(url: string) {
  return /^(https?:\/\/|\/[^/])/i.test(url) ? url : undefined;
}
function referenceDisplay() {
  return props.field.type === "reference"
    ? (props.field.reference.display?.(value.value, props.env) ??
        props.field.reference.render(value.value, props.env, true, () => {}))
    : null;
}
const displayText = computed(() => {
  if (props.field.type === "select")
    return (
      props.field.options.find((option) => option.value === value.value)?.label ??
      String(value.value)
    );
  if (props.field.type === "switch") return value.value ? "是" : "否";
  if (props.field.type === "date") return formatDate(String(value.value));
  if (props.field.type === "datetime") return formatDateTime(String(value.value));
  if (props.field.type === "month") return formatMonth(String(value.value));
  if (props.field.type === "year") return formatYear(String(value.value));
  if (props.field.type === "dateRange")
    return Array.isArray(value.value)
      ? value.value.map((item) => formatDate(String(item))).join(" 至 ")
      : "—";
  if (props.field.type === "amount")
    return formatMoney(String(value.value), {
      precision: props.field.props?.precision,
      currency: props.field.props?.currency,
    });
  if (props.field.type === "rich") return richTextContent(value.value).text || "—";
  return String(value.value);
});
</script>

<style scoped lang="scss">
.field-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  .el-image {
    width: 72px;
    height: 72px;
    border-radius: var(--el-border-radius-base);
  }
}
.field-files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  a {
    color: var(--el-color-primary);
  }
}
</style>

<style>
.field-rich-content {
  overflow-wrap: anywhere;
  max-width: 100%;
  overflow-x: auto;
}
.field-rich-content img {
  max-width: 100%;
  height: auto;
}
.field-rich-content table {
  border-collapse: collapse;
}
.field-rich-content th,
.field-rich-content td {
  border: 1px solid var(--el-border-color);
  padding: 6px 10px;
}
.field-rich-content pre {
  white-space: pre-wrap;
}
</style>
