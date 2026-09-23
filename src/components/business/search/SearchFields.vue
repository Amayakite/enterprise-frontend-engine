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
  /** 调用方正在查询时禁用修改与重复提交。 */
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
/** 保存尚未提交的查询值，从初始查询函数复制，输入时不直接修改页面已应用条件。 */
const draft = shallowRef<Q>(cloneModel(props.createInitialQuery()));
/** 是否展开标记为高级的筛选字段，收起时保留输入。 */
const expanded = ref(false);
/** 把查询草稿作为模型传给字段输入，附带当前组织等信息。 */
const environment = computed<FieldEnvironment<Q, C>>(() => ({
  model: draft.value,
  context: props.context,
  mode: "add",
}));
/** 配置中存在高级字段时才显示展开/收起入口。 */
const hasAdvanced = computed(() => props.fields.some((field) => field.search.advanced));
/** 根据展开状态选择当前显示的快捷和高级字段。 */
const displayedFields = computed(() =>
  props.fields.filter((field) => expanded.value || !field.search.advanced)
);
/** 统计高级条件中已填写的数量，用于收起时提示还有多少条件。 */
const advancedCount = computed(
  () =>
    props.fields.filter((field) => field.search.advanced && !isEmptyValue(draft.value[field.key]))
      .length
);
// TS 不能将泛型判别联合的交集自动回退到其左侧，公开字段配置不变。
function asField(field: SearchField<Q, C>) {
  return field as FieldDefinition<Q, C>;
}
/** 同时写入查询字段值和参照附带回填，不直接请求列表。 */
function setValue(key: FieldKey<Q>, value: Q[FieldKey<Q>], mapped: Partial<Q> = {}) {
  if (!props.loading)
    draft.value = { ...draft.value, ...cloneModel(mapped), [key]: cloneModel(value) };
}
/** 把当前查询草稿交给页面应用，实际列表请求由页面处理。 */
function submit() {
  if (!props.loading) emit("submit", cloneModel(draft.value));
}
/** 重新创建默认查询值并通知页面重置，不复用之前被修改的初始对象。 */
function reset() {
  if (props.loading) return;
  draft.value = cloneModel(props.createInitialQuery());
  emit("reset", cloneModel(draft.value));
}
/** 在可直接提交的输入中响应回车，同时避开输入法等不应提交的情况。 */
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
/** 生成 field-* 查询插槽名，供页面替换输入组件。 */
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
