<template>
  <el-form class="my-search" label-position="top" @submit.prevent="submit" @keydown.enter="onEnter">
    <div class="my-search-fields">
      <el-form-item
        v-for="field in displayedFields"
        :key="field.key"
        :label="field.label"
        :data-search-type="field.type"
      >
        <slot
          :name="fieldSlotName(field.key)"
          :value="draft[field.key]"
          :set-value="(value: Q[FieldKey<Q>]) => setValue(field.key, value)"
          :field="field"
          :readonly="!!loading"
        >
          <FieldInput
            :field="asField(field)"
            :env="environment"
            :readonly="!!loading"
            @change="(value, mapped) => setValue(field.key, value, mapped)"
          />
        </slot>
      </el-form-item>
    </div>
    <div class="my-search-actions">
      <el-button type="primary" :loading="loading" @click="submit">查询</el-button>
      <el-button :disabled="loading" @click="reset">重置</el-button>
      <el-button v-if="hasAdvanced" link type="primary" @click="expanded = !expanded">
        {{ expanded ? "收起高级条件" : "展开高级条件" }}
      </el-button>
      <el-text v-if="advancedCount" type="info" size="small">
        已启用 {{ advancedCount }} 项高级条件
      </el-text>
    </div>
  </el-form>
</template>

<script setup lang="ts" generic="Q extends object, C = undefined">
import FieldInput from "@/components/business/fields/FieldInput.vue";
import { isEmptyValue } from "@/utils/validate";
import { cloneModel } from "@/components/business/fields/model";
import type {
  FieldDefinition,
  FieldEnvironment,
  FieldKey,
  SearchField,
} from "@/components/business/fields/types";
const props = defineProps<{
  /** 传统搜索字段定义。 */
  fields: readonly SearchField<Q, C>[];
  /** 返回重置搜索条件时使用的初始查询。 */
  createInitialQuery: () => Q;
  /** 搜索字段渲染和联动所需的页面上下文。 */
  context: C;
  /** 宿主正在查询时禁用修改与重复提交。 */
  loading?: boolean;
}>();
const emit = defineEmits<{
  /**
   * 用户提交当前搜索草稿。
   * @example `<SearchFields @submit="(query) => fetchPage(query)" />`
   */
  submit: [query: Q];
  /**
   * 用户重置搜索条件后触发，携带新的初始查询。
   * @example `<SearchFields @reset="(query) => fetchPage(query)" />`
   */
  reset: [query: Q];
}>();
const slots = defineSlots<{
  [K in FieldKey<Q> as `field-${K}`]?: (props: {
    value: Q[K];
    setValue: (value: Q[K]) => void;
    field: SearchField<Q, C>;
    readonly: boolean;
  }) => unknown;
}>();
const draft = shallowRef<Q>(cloneModel(props.createInitialQuery()));
const expanded = ref(false);
const environment = computed<FieldEnvironment<Q, C>>(() => ({
  model: draft.value,
  context: props.context,
  mode: "add",
}));
const hasAdvanced = computed(() => props.fields.some((field) => field.search.advanced));
const displayedFields = computed(() =>
  props.fields.filter((field) => expanded.value || !field.search.advanced)
);
const advancedCount = computed(
  () =>
    props.fields.filter((field) => field.search.advanced && !isEmptyValue(draft.value[field.key]))
      .length
);
// TS 不能将泛型判别联合的交集自动回退到其左侧，公开字段合同不变。
function asField(field: SearchField<Q, C>) {
  return field as FieldDefinition<Q, C>;
}
function setValue(key: FieldKey<Q>, value: Q[FieldKey<Q>], mapped: Partial<Q> = {}) {
  if (!props.loading)
    draft.value = { ...draft.value, ...cloneModel(mapped), [key]: cloneModel(value) };
}
function submit() {
  if (!props.loading) emit("submit", cloneModel(draft.value));
}
function reset() {
  if (props.loading) return;
  draft.value = cloneModel(props.createInitialQuery());
  emit("reset", cloneModel(draft.value));
}
function onEnter(event: KeyboardEvent) {
  const target = event.target;
  if (
    event.isComposing ||
    event.defaultPrevented ||
    !(target instanceof HTMLInputElement) ||
    !["text", "number"].includes(
      target.closest<HTMLElement>("[data-search-type]")?.dataset.searchType ?? ""
    )
  )
    return;
  event.preventDefault();
  submit();
}
defineExpose({ reset, submit, getQuery: () => cloneModel(draft.value) });
function fieldSlotName(key: string) {
  return `field-${key}` as Exclude<keyof typeof slots, "footer">;
}
</script>

<style scoped lang="scss">
.my-search-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0 16px;
  :deep(.el-input-number),
  :deep(.el-date-editor) {
    width: 100%;
  }
}
.my-search-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
