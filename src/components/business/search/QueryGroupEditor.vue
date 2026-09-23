<template>
  <fieldset class="query-group" :data-query-node="modelValue.id" tabindex="-1">
    <legend>第 {{ depth }} 层条件组</legend>
    <div class="query-group__toolbar">
      <el-select
        :model-value="modelValue.operator"
        aria-label="条件组关系"
        class="query-group__operator"
        @update:model-value="setOperator"
      >
        <el-option label="全部满足（AND）" value="and" />
        <el-option label="任一满足（OR）" value="or" />
      </el-select>
      <el-button size="small" @click="addCondition">添加条件</el-button>
      <el-button size="small" :disabled="depth >= QUERY_LIMITS.depth" @click="addGroup">
        添加条件组
      </el-button>
      <el-button v-if="depth > 1" link type="danger" @click="emit('remove')">删除组</el-button>
    </div>
    <p v-if="!modelValue.children.length" class="query-group__hint">
      添加条件；空的根组表示不使用高级条件。
    </p>
    <template v-for="(node, index) in modelValue.children" :key="node.id">
      <QueryGroupEditor
        v-if="node.kind === 'group'"
        :schema="schema"
        :model-value="node"
        :depth="depth + 1"
        :issues="issues"
        @update:model-value="replace(index, $event)"
        @remove="remove(index)"
      />
      <div v-else class="query-condition" :data-query-node="node.id" tabindex="-1">
        <div class="query-condition__inputs">
          <el-select
            :model-value="node.field ?? undefined"
            aria-label="查询字段"
            placeholder="选择查询字段"
            filterable
            @update:model-value="changeField(index, $event)"
          >
            <el-option
              v-for="[key, field] in advancedFields"
              :key="key"
              :label="field.label"
              :value="key"
            />
          </el-select>
          <el-select
            :model-value="node.operator ?? undefined"
            aria-label="查询运算符"
            placeholder="运算符"
            :disabled="!node.field"
            @update:model-value="changeOperator(index, $event)"
          >
            <el-option
              v-for="operator in fieldFor(node)?.operators ?? []"
              :key="operator"
              :label="QUERY_OPERATORS[operator]"
              :value="operator"
            />
          </el-select>
          <QueryValueInput
            v-if="fieldFor(node)"
            :key="`${node.field}:${node.operator}`"
            :field="fieldFor(node)!"
            :operator="node.operator"
            :model-value="node.value"
            @update:model-value="replace(index, { ...node, value: $event })"
          />
          <span v-else class="query-group__hint">先选择字段</span>
          <el-button link type="danger" aria-label="删除条件" @click="remove(index)">
            删除
          </el-button>
        </div>
        <p v-if="issue(node.id)" role="alert" class="query-condition__error">
          {{ issue(node.id) }}
        </p>
      </div>
    </template>
    <p v-if="issue(modelValue.id)" role="alert" class="query-condition__error">
      {{ issue(modelValue.id) }}
    </p>
  </fieldset>
</template>
<script setup lang="ts" generic="S extends QuerySchema">
import QueryValueInput from "./QueryValueInput.vue";
import { QUERY_LIMITS, QUERY_OPERATORS, queryField } from "./model";
import type { QueryDraftCondition, QueryDraftGroup, QueryIssue, QuerySchema } from "./types";
const props = defineProps<{
  /**
   * 查询字段定义；只显示支持 advanced 的字段。
   * @example `<QueryGroupEditor :schema="schema" ... />`
   */
  schema: S;
  /**
   * 当前高级查询分组草稿（v-model）。
   * @example `<QueryGroupEditor v-model="draft.advanced" ... />`
   */
  modelValue: QueryDraftGroup<S>;
  /**
   * 当前分组嵌套深度，用于限制继续新增子分组。
   * @example `<QueryGroupEditor :depth="0" ... />`
   */
  depth: number;
  /**
   * 当前查询草稿的校验问题列表。
   * @example `<QueryGroupEditor :issues="issues" ... />`
   */
  issues: readonly QueryIssue[];
}>();
const emit = defineEmits<{
  /**
   * 高级查询分组草稿变更；值可能仍含未完成条件。
   * @example `<QueryGroupEditor v-model="draft.advanced" :schema="schema" />`
   */
  "update:modelValue": [value: QueryDraftGroup<S>];
  /**
   * 用户请求移除当前分组；父级负责从其 children 中删除该节点。
   * @example `<QueryGroupEditor @remove="removeGroup" />`
   */
  remove: [];
}>();
/** 可用于高级查询的字段选项，不把仅允许快捷查询的字段放进下拉列表。 */
const advancedFields = computed(() =>
  Object.entries(props.schema).filter(([, field]) => field.entries.includes("advanced"))
);
/** 按条件或分组 ID 显示对应校验错误。 */
const issue = (id: string) => props.issues.find((item) => item.nodeId === id)?.message;
/** 查找条件对应的字段定义，用于选择运算符和输入控件。 */
const fieldFor = (node: QueryDraftCondition<S>) => queryField(props.schema, node.field);
/** 切换当前组的“全部满足/任一满足”，只接受 and 或 or。 */
function setOperator(value: string) {
  if (value === "and" || value === "or")
    emit("update:modelValue", { ...props.modelValue, operator: value });
}
/** 替换当前组中的一个条件或子组，通过事件回写而不直接修改父对象。 */
function replace(index: number, value: QueryDraftCondition<S> | QueryDraftGroup<S>) {
  emit("update:modelValue", {
    ...props.modelValue,
    children: props.modelValue.children.map((node, i) => (i === index ? value : node)),
  });
}
/** 删除指定条件或子组，保留其他节点的 ID 和顺序。 */
function remove(index: number) {
  emit("update:modelValue", {
    ...props.modelValue,
    children: props.modelValue.children.filter((_, i) => i !== index),
  });
}
/** 追加一个尚未选字段的空条件，用户填写完整后才能应用查询。 */
function addCondition() {
  emit("update:modelValue", {
    ...props.modelValue,
    children: [
      ...props.modelValue.children,
      { kind: "condition", id: crypto.randomUUID(), field: null, operator: null, value: null },
    ],
  });
}
/** 在允许的最大嵌套深度内新增 AND 子组，避免无限嵌套。 */
function addGroup() {
  if (props.depth >= QUERY_LIMITS.depth) return;
  emit("update:modelValue", {
    ...props.modelValue,
    children: [
      ...props.modelValue.children,
      { kind: "group", id: crypto.randomUUID(), operator: "and", children: [] },
    ],
  });
}
/** 选择新字段时使用它的第一个允许运算符，并清除与旧字段类型不兼容的值。 */
function changeField(index: number, key: string) {
  const node = props.modelValue.children[index];
  const field = queryField(props.schema, key);
  if (!node || node.kind !== "condition" || !field) return;
  const operator = field.operators[0] ?? null;
  replace(index, {
    ...node,
    field: key as Extract<keyof S, string>,
    operator,
    value: operator?.startsWith("is") ? undefined : null,
  });
}
/** 更换运算符时重置旧值；判空运算符不需要输入值。 */
function changeOperator(index: number, operator: string) {
  const node = props.modelValue.children[index];
  if (node?.kind === "condition")
    replace(index, { ...node, operator, value: operator.startsWith("is") ? undefined : null });
}
</script>
<style scoped lang="scss">
.query-group {
  min-width: 0;
  margin: 12px 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}
.query-group legend {
  padding: 0 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.query-group__toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.query-group__operator {
  width: 170px;
}
.query-group__toolbar :deep(.el-button) {
  margin: 0;
}
.query-condition {
  margin-top: 12px;
  min-width: 0;
}
.query-condition__inputs {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) 110px minmax(180px, 2fr) auto;
  align-items: start;
  gap: 8px;
}
.query-condition__error {
  color: var(--el-color-danger);
  margin: 6px 0 0;
  font-size: 12px;
}
.query-group__hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 680px) {
  .query-group {
    padding: 8px;
  }
  .query-condition__inputs {
    grid-template-columns: minmax(0, 1fr) 105px;
  }
  .query-condition__inputs > :nth-child(3) {
    grid-column: 1 / -1;
  }
  .query-condition__inputs > :last-child {
    justify-self: end;
    grid-column: 2;
  }
}
</style>
