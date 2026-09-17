<template>
  <div v-if="node.kind === 'group'" class="query-summary-group">
    <span class="query-summary-group__relation">
      {{ node.operator === "and" ? "全部满足" : "任一满足" }}
    </span>
    <QuerySummary
      v-for="child in node.children"
      :key="child.id"
      :schema="schema"
      :node="child"
      @remove="emit('remove', $event)"
    />
  </div>
  <span v-else class="query-summary-condition">
    <span>{{ querySummary(schema, node) }}</span>
    <el-button
      link
      :aria-label="`移除${querySummary(schema, node)}`"
      @click="emit('remove', node.id)"
    >
      <el-icon><Close /></el-icon>
    </el-button>
  </span>
</template>
<script setup lang="ts" generic="S extends QuerySchema">
import { Close } from "@element-plus/icons-vue";
import { querySummary } from "./model";
import type { QueryNode, QuerySchema } from "./types";
defineProps<{
  /**
   * 查询字段定义，用于把条件转换为可读文本。
   * @example `<QuerySummary :schema="schema" ... />`
   */
  schema: S;
  /**
   * 要展示的已应用查询节点。
   * @example `<QuerySummary :node="condition" ... />`
   */
  node: QueryNode<S>;
}>();
const emit = defineEmits<{
  /**
   * 用户移除某个已应用查询节点，id 是 QueryNode 的唯一标识。
   * @example `<QuerySummary @remove="(id) => removeCondition(id)" />`
   */
  remove: [id: string];
}>();
</script>
<style scoped lang="scss">
.query-summary-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  border-left: 2px solid var(--el-border-color);
  padding-left: 8px;
}
.query-summary-group__relation {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.query-summary-condition {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 2px 6px;
  background: var(--el-fill-color-light);
  max-width: 100%;
  font-size: 12px;
}
.query-summary-condition > span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.query-summary-condition :deep(.el-button) {
  flex-shrink: 0;
  margin: 0;
  padding: 2px;
}
</style>
