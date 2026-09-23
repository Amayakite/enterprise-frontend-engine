<template>
  <!-- 按字段类型显示 env.model[field.key]，空值显示横线。传 scene="table" 使用列表格式，其余使用详情格式。 -->
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
   * 决定如何显示值，例如 amount 显示金额，date 显示日期。普通文本至少传 key、label、type。
   * 直接使用时无需开启 detail；选择框、字典和参照仍需各自的配置。
   * @example
   * `<FieldDisplay :field="field" ... />`
   */
  field: FieldDefinition<M, C>;
  /**
   * model 提供要显示的数据，context 提供格式化所需的组织等信息，不需要时传 undefined。
   * mode 当前只支持 add/edit，纯详情可传 edit，组件始终只读。
   * @example
   * `<FieldDisplay :env="{ model: row, context: undefined, mode: 'edit' }" ... />`
   */
  env: FieldEnvironment<M, C>;
  /**
   * 格式选择；省略或 detail 使用 detail.format，table 使用 table.format；未配置时按字段类型显示。
   * @example
   * `<FieldDisplay scene="table" ... />`
   */
  scene?: "detail" | "table";
}>();
/** 按 field.key 从当前模型读取值，金额、图片等显示分支共用它。 */
const value = computed(() => props.env.model[props.field.key]);
/** 仅在需要显示 HTML 时清理富文本中的危险内容，避免把原始 HTML 直接插入页面。 */
const safeRichHtml = computed(() =>
  sanitizeRichText(typeof value.value === "string" ? value.value : "")
);
/** 优先执行场景对应的自定义格式化；返回 undefined 才继续使用默认类型显示。 */
const formatted = computed(() =>
  props.scene === "table"
    ? props.field.table
      ? props.field.table.format?.(value.value, props.env)
      : undefined
    : typeof props.field.detail === "object"
      ? props.field.detail.format?.(value.value, props.env)
      : undefined
);
/** 计算当前字典编码，允许根据组织或模型动态选择字典。 */
const dictCode = computed(() =>
  props.field.type === "dict"
    ? typeof props.field.dict.code === "function"
      ? props.field.dict.code(props.env)
      : props.field.dict.code
    : ""
);
/** 将单值或数组整理为字典可识别的字符串/数字集合，过滤其他类型。 */
const dictValues = computed(() =>
  (Array.isArray(value.value) ? value.value : [value.value]).filter(
    (item): item is string | number => typeof item === "string" || typeof item === "number"
  )
);
/** 整理单图或多图地址，并过滤不允许的地址，同时用于缩略图和预览。 */
const imageUrls = computed(() =>
  (Array.isArray(value.value) ? value.value : [value.value]).filter(
    (item): item is string => typeof item === "string" && !!safeUrl(item)
  )
);
/** 附件字段的展示列表，非数组值按空列表处理。 */
const files = computed(() => (Array.isArray(value.value) ? (value.value as FileInfo[]) : []));
/** 只允许 HTTP(S) 和站内绝对路径，避免附件或图片使用脚本等不安全地址。 */
function safeUrl(url: string) {
  return /^(https?:\/\/|\/[^/])/i.test(url) ? url : undefined;
}
/** 优先使用参照专用显示方法；旧参照没有 display 时使用其只读渲染。 */
function referenceDisplay() {
  return props.field.type === "reference"
    ? (props.field.reference.display?.(value.value, props.env) ??
        props.field.reference.render(value.value, props.env, true, () => {}))
    : null;
}
/** 按类型生成默认文字：选项名称、是/否、日期、金额或富文本纯文字；其余值转成字符串。 */
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
