<template>
  <div class="crud-cell">
    <el-button v-if="navigate" link type="primary" :disabled="disabled" @click="emit('navigate')">
      <span v-if="column.format">{{ column.format(row) }}</span>
      <FieldDisplay v-else-if="field" :field="field" :env="environment" scene="table" />
      <span v-else>{{ row[column.key] }}</span>
    </el-button>
    <span v-else-if="column.format">{{ column.format(row) }}</span>
    <FieldDisplay v-else-if="field" :field="field" :env="environment" scene="table" />
    <span v-else>{{ row[column.key] }}</span>
    <small v-if="column.secondary">{{ row[column.secondary] }}</small>
  </div>
</template>
<script setup lang="ts" generic="Row extends object, C">
import { computed } from "vue";
import FieldDisplay from "@/components/business/fields/FieldDisplay.vue";
import type { FieldDefinition, FieldEnvironment } from "@/components/business/fields/types";
import type { CrudColumn } from "./types";
const props = defineProps<{
  /**
   * 当前单元格所在的只读行。
   * @example `<CrudCell :row="row" ... />`
   */
  row: Readonly<Row>;
  /**
   * 当前列表列配置，决定主/次文本及链接行为。
   * @example `<CrudCell :column="column" ... />`
   */
  column: CrudColumn<Row>;
  /**
   * 对应字段合同；传入后使用 FieldDisplay 格式化。
   * @example `<CrudCell :field="field" ... />`
   */
  field?: FieldDefinition<Row, C>;
  /**
   * 字段展示和格式化所需的页面上下文。
   * @example `<CrudCell :context="context" ... />`
   */
  context: C;
  /**
   * 是否把主文本渲染为可导航操作。
   * @example `<CrudCell :navigate="true" ... />`
   */
  navigate?: boolean;
  /**
   * 是否禁用单元格导航。
   * @example `<CrudCell :disabled="loading" ... />`
   */
  disabled?: boolean;
}>();
const emit = defineEmits<{
  /**
   * 用户点击可导航单元格；当前行主键由父级单元格插槽闭包持有。
   * @example `<CrudCell @navigate="openDetail(rowKey)" />`
   */
  navigate: [];
}>();
const environment = computed<FieldEnvironment<Row, C>>(() => ({
  model: props.row,
  context: props.context,
  mode: "edit",
}));
</script>
<style scoped lang="scss">
.crud-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--el-text-color-secondary);
  }
}
</style>
