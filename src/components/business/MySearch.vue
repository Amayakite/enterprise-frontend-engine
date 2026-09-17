<template>
  <QueryPanel
    v-if="props.mode === 'query'"
    ref="queryPanel"
    :schema="props.schema"
    :model-value="props.modelValue"
    :initial="props.initial"
    :scope-key="props.scopeKey"
    :loading="props.loading"
    @update:model-value="onQueryModelUpdate"
    @apply="onQueryApply"
    @refresh="onQueryRefresh"
  />
  <SearchFields
    v-else
    ref="legacy"
    :fields="props.fields"
    :create-initial-query="props.createInitialQuery"
    :context="props.context"
    :loading="props.loading"
    @submit="onFieldsSubmit"
    @reset="onFieldsReset"
  >
    <template v-for="field in slottedFields" :key="field.key" #[`field-${field.key}`]="slotProps">
      <slot :name="fieldSlotName(field.key)" v-bind="slotProps" />
    </template>
  </SearchFields>
</template>
<script
  setup
  lang="ts"
  generic="Q extends object, C = undefined, S extends QuerySchema = QuerySchema"
>
import SearchFields from "./search/SearchFields.vue";
import QueryPanel from "./search/QueryPanel.vue";
import type { FieldKey, SearchField } from "./fields/types";
import type { AppliedQuery, QueryApplyReason, QueryEntry, QuerySchema } from "./search/types";
// 互斥字段必须在另一分支显式标为可选 never，避免 Vue 将联合成员都编译为必填 prop。
const props = defineProps<
  | {
      /**
       * 传统字段搜索模式（默认）。
       * @example `<MySearch :fields="fields" :context="context" :create-initial-query="createQuery" />`
       */
      mode?: "fields";
      /**
       * 传统搜索字段定义。
       * @example `<MySearch :fields="searchFields" ... />`
       */
      fields: readonly SearchField<Q, C>[];
      /**
       * 返回传统搜索的初始查询值。
       * @example `<MySearch :create-initial-query="createInitialQuery" ... />`
       */
      createInitialQuery: () => Q;
      /** 字段渲染与联动所需的页面上下文。 */
      context: C;
      /** 宿主正在查询时禁用重复操作。 */
      loading?: boolean;
      schema?: never;
      modelValue?: never;
      initial?: never;
      scopeKey?: never;
    }
  | {
      /**
       * 使用 QueryPanel 的结构化查询模式。
       * @example `<MySearch mode="query" :schema="schema" v-model="query" scope-key="customer" />`
       */
      mode: "query";
      /**
       * 可查询字段及其允许的操作符。
       * @example `<MySearch mode="query" :schema="customerQuerySchema" ... />`
       */
      schema: S;
      /**
       * 当前已应用的结构化查询条件（v-model）。
       * @example `<MySearch mode="query" v-model="appliedQuery" ... />`
       */
      modelValue: AppliedQuery<S>;
      /** 重置时恢复的结构化查询条件。 */
      initial?: AppliedQuery<S>;
      /** 查询范围的稳定标识。 */
      scopeKey: string;
      /** 宿主正在查询时禁用重复操作。 */
      loading?: boolean;
      fields?: never;
      createInitialQuery?: never;
      context?: never;
    }
>();
const emit = defineEmits<{
  /**
   * 传统字段查询提交。
   * @example `<MySearch @submit="(query) => load(query)" />`
   */
  submit: [value: Q];
  /**
   * 传统字段查询重置，value 为 createInitialQuery 返回的新查询。
   * @example `<MySearch @reset="(query) => load(query)" />`
   */
  reset: [value: Q];
  /**
   * 查询模式下已应用条件变更。
   * @example `<MySearch v-model="appliedQuery" mode="query" />`
   */
  "update:modelValue": [value: AppliedQuery<S>];
  /**
   * 查询模式下确认、移除、清空或重置条件；reason 表示动作来源。
   * @example `<MySearch mode="query" @apply="(query) => loadByAppliedQuery(query)" />`
   */
  apply: [value: AppliedQuery<S>, reason: "apply" | "remove" | "clear" | "reset"];
  /**
   * 查询模式下请求重新加载结果。
   * @example `<MySearch mode="query" @refresh="reload" />`
   */
  refresh: [];
}>();
/** 转发 QueryPanel 的已应用查询，保持 MySearch 的对外 v-model 合同。 */
function onQueryModelUpdate(value: AppliedQuery<S>) {
  emit("update:modelValue", value);
}
/** 转发 QueryPanel 的执行动作及来源。 */
function onQueryApply(value: AppliedQuery<S>, reason: QueryApplyReason) {
  emit("apply", value, reason);
}
/** 转发 QueryPanel 的刷新请求。 */
function onQueryRefresh() {
  emit("refresh");
}
/** 转发传统字段搜索的提交值。 */
function onFieldsSubmit(value: Q) {
  emit("submit", value);
}
/** 转发传统字段搜索的重置值。 */
function onFieldsReset(value: Q) {
  emit("reset", value);
}
const slots = defineSlots<{
  [K in FieldKey<Q> as `field-${K}`]?: (props: {
    value: Q[K];
    setValue: (value: Q[K]) => void;
    field: SearchField<Q, C>;
    readonly: boolean;
  }) => unknown;
}>();
const legacy = ref<{ submit: () => void; reset: () => void; getQuery: () => Q }>();
const queryPanel = ref<{
  reset: () => void;
  clear: () => void;
  apply: (entry: QueryEntry) => Promise<void>;
}>();
const fieldSlotName = (key: string) => `field-${key}` as keyof typeof slots;
const slottedFields = computed(() =>
  props.mode === "query" ? [] : props.fields.filter((field) => !!slots[fieldSlotName(field.key)])
);
defineExpose({
  submit: () =>
    props.mode === "query" ? queryPanel.value?.apply("quick") : legacy.value?.submit(),
  reset: () => (props.mode === "query" ? queryPanel.value?.reset() : legacy.value?.reset()),
  getQuery: () => (props.mode === "query" ? props.modelValue : legacy.value?.getQuery()),
});
</script>
