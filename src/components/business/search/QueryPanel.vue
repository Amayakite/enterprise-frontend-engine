<template>
  <section
    ref="root"
    tabindex="-1"
    class="query-panel"
    :class="{ 'query-panel--compact': compact }"
    aria-label="组合查询"
  >
    <form
      class="query-panel__quick"
      @submit.prevent="applyEntry('quick')"
      @keydown.enter="quickEnter"
    >
      <div v-if="$slots['commands-start']" class="query-panel__commands-start">
        <slot name="commands-start" />
      </div>
      <div v-if="draft.quick.length" class="query-panel__search-group">
        <div class="query-panel__fields">
          <label
            v-for="node in draft.quick"
            :key="node.id"
            class="query-panel__field"
            :data-query-node="node.id"
            tabindex="-1"
          >
            <span class="sr-only">{{ fieldFor(node)?.label }}</span>
            <slot :name="querySlot(node.field)" :draft="draft" :set-draft="setDraft">
              <QueryValueInput
                v-if="fieldFor(node)"
                :field="fieldFor(node)!"
                :operator="node.operator"
                :model-value="node.value"
                @update:model-value="updateFlat('quick', node.id, $event)"
              >
                <template v-if="inlineSearch" #suffix>
                  <el-tooltip content="查询（回车）">
                    <el-button
                      link
                      :icon="Search"
                      :disabled="loading"
                      aria-label="查询"
                      @click="applyEntry('quick')"
                    />
                  </el-tooltip>
                </template>
              </QueryValueInput>
            </slot>
            <small v-if="issue(node.id)" role="alert" class="query-panel__error">
              {{ issue(node.id) }}
            </small>
          </label>
        </div>
        <el-tooltip v-if="compact && !inlineSearch" content="查询（回车）">
          <el-button
            class="query-panel__search-submit"
            :icon="Search"
            :disabled="loading"
            aria-label="查询"
            @click="applyEntry('quick')"
          />
        </el-tooltip>
      </div>
      <div v-if="!compact" class="query-panel__actions">
        <el-button
          v-if="draft.quick.length"
          type="primary"
          :icon="Search"
          @click="applyEntry('quick')"
        >
          查询
        </el-button>
        <el-button v-if="draft.normal.length" :icon="Filter" @click="openNormal">
          普通查询
        </el-button>
        <el-button v-if="hasAdvanced" :icon="Operation" @click="openAdvanced">高级查询</el-button>
        <el-button :icon="RefreshLeft" @click="restoreDefaults">重置</el-button>
        <el-button
          :disabled="loading"
          :aria-busy="loading"
          :title="loading ? '正在更新列表' : '重新加载当前条件下的数据'"
          @click="emit('refresh')"
        >
          <span
            aria-hidden="true"
            class="query-panel__refresh-icon ui-refresh-icon i-svg:refresh"
            :class="{ 'is-spinning': loading }"
          />
          刷新
        </el-button>
        <Transition name="query-status">
          <span v-if="loading" role="status" class="query-panel__status">正在更新列表…</span>
        </Transition>
      </div>
      <div v-if="compact || $slots['commands-end']" class="query-panel__commands-end">
        <el-popover
          v-if="compact"
          v-model:visible="filterOpen"
          trigger="click"
          placement="bottom-end"
          width="min(360px, calc(100vw - 32px))"
        >
          <template #reference>
            <el-button
              class="query-panel__filter-trigger"
              :icon="Filter"
              :type="conditionCount ? 'primary' : undefined"
              :plain="!!conditionCount"
              :disabled="loading"
              aria-label="筛选"
            >
              筛选
              <span v-if="conditionCount">· {{ conditionCount }}</span>
              <el-icon class="query-panel__chevron">
                <ArrowDown />
              </el-icon>
            </el-button>
          </template>
          <div class="query-panel__filter-menu" aria-label="筛选选项">
            <el-button v-if="draft.normal.length" :icon="Filter" @click="openNormal">
              普通查询
            </el-button>
            <el-button v-if="hasAdvanced" :icon="Operation" @click="openAdvanced">
              高级查询
            </el-button>
            <el-button :icon="RefreshLeft" :disabled="loading" @click="restoreDefaults">
              重置查询
            </el-button>
            <div v-if="where" class="query-panel__filter-summary" aria-label="已应用查询">
              <QuerySummary :schema="schema" :node="where" @remove="removeCondition" />
              <el-button link :icon="Delete" :disabled="loading" @click="clear">清空条件</el-button>
            </div>
            <span v-else class="query-panel__status">当前未设置筛选条件</span>
          </div>
        </el-popover>
        <el-tooltip v-if="compact" content="刷新当前查询">
          <el-button
            class="query-panel__icon-button"
            :icon="Refresh"
            :loading="loading"
            :disabled="loading"
            aria-label="刷新"
            @click="emit('refresh')"
          />
        </el-tooltip>
        <slot name="commands-end" />
      </div>
    </form>
    <div v-if="where && !compact" class="query-panel__summary" aria-label="已应用查询">
      <QuerySummary :schema="schema" :node="where" @remove="removeCondition" />
      <el-button link type="primary" @click="clear">清空条件</el-button>
    </div>
    <MyDialog
      v-model="normalOpen"
      title="普通查询"
      width="720px"
      class="query-panel-dialog"
      confirm-text="应用查询"
      @confirm="applyEntry('normal')"
      @closed="cancelNormal"
    >
      <div ref="normalRoot" class="query-panel__normal-shell">
        <div class="query-panel__normal">
          <label
            v-for="node in draft.normal"
            :key="node.id"
            class="query-panel__field"
            :data-query-node="node.id"
            tabindex="-1"
          >
            <span>{{ fieldFor(node)?.label }}</span>
            <slot :name="querySlot(node.field)" :draft="draft" :set-draft="setDraft">
              <QueryValueInput
                v-if="fieldFor(node)"
                :field="fieldFor(node)!"
                :operator="node.operator"
                :model-value="node.value"
                @update:model-value="updateFlat('normal', node.id, $event)"
              />
            </slot>
            <small v-if="issue(node.id)" role="alert" class="query-panel__error">
              {{ issue(node.id) }}
            </small>
          </label>
        </div>
      </div>
      <template #footer="{ close }">
        <div class="query-panel__dialog-footer">
          <el-button :icon="RefreshLeft" :disabled="loading" @click="resetEntry('normal')">
            重置查询
          </el-button>
          <span class="query-panel__footer-spacer" />
          <el-button :disabled="loading" @click="close">取消</el-button>
          <el-button
            type="primary"
            :icon="Search"
            :disabled="loading"
            @click="applyEntry('normal')"
          >
            应用查询
          </el-button>
        </div>
      </template>
    </MyDialog>
    <MyDialog
      v-model="advancedOpen"
      title="高级查询"
      width="980px"
      class="query-panel-dialog"
      confirm-text="应用查询"
      @confirm="applyEntry('advanced')"
      @closed="cancelAdvanced"
    >
      <p class="query-panel__status">
        最多 {{ QUERY_LIMITS.conditions }} 条条件、{{ QUERY_LIMITS.depth }}
        层条件组。应用后与快捷、普通查询共同生效。
      </p>
      <div ref="advancedRoot">
        <QueryGroupEditor
          v-if="draft.advanced"
          :schema="schema"
          :model-value="draft.advanced"
          :depth="1"
          :issues="issues"
          @update:model-value="draft = { ...draft, advanced: $event }"
        />
      </div>
      <template #footer="{ close }">
        <div class="query-panel__dialog-footer">
          <el-button :icon="RefreshLeft" :disabled="loading" @click="resetEntry('advanced')">
            重置查询
          </el-button>
          <span class="query-panel__footer-spacer" />
          <el-button :disabled="loading" @click="close">取消</el-button>
          <el-button
            type="primary"
            :icon="Search"
            :disabled="loading"
            @click="applyEntry('advanced')"
          >
            应用查询
          </el-button>
        </div>
      </template>
    </MyDialog>
  </section>
</template>
<script setup lang="ts" generic="S extends QuerySchema">
import { provide, computed } from "vue";
import { queryScopeKey } from "./context";
import QueryValueInput from "./QueryValueInput.vue";
import {
  Filter,
  Operation,
  RefreshLeft,
  Search,
  Refresh,
  ArrowDown,
  Delete,
} from "@element-plus/icons-vue";
import { focusFieldControl } from "@/utils/dom";
import MyDialog from "@/components/common/MyDialog.vue";
import QueryGroupEditor from "./QueryGroupEditor.vue";
import QuerySummary from "./QuerySummary.vue";
import { cloneModel } from "@/components/business/fields/model";
import {
  applyQueryDraft,
  combineQuery,
  createQueryDraft,
  emptyAppliedQuery,
  queryField,
  removeQueryNode,
  QUERY_LIMITS,
} from "./model";
import type {
  QueryNode,
  AppliedQuery,
  QueryDraft,
  QueryDraftCondition,
  QueryEntry,
  QueryIssue,
  QueryPanelEmits,
  QuerySchema,
} from "./types";
const props = defineProps<{
  /**
   * 紧凑单行工具栏；默认 false 保持独立查询面板布局，MyCrudList 统一启用。
   * 普通/高级查询及条件摘要收进筛选面板，快捷查询与原事件语义不变。
   * @example
   * `<QueryPanel compact :schema="schema" ... />`
   */
  compact?: boolean;
  /**
   * 可查询字段及其允许的操作符。
   * @example `<QueryPanel :schema="customerQuerySchema" ... />`
   */
  schema: S;
  /**
   * 当前已应用且已校验的查询条件（v-model）。
   * @example `<QueryPanel v-model="appliedQuery" ... />`
   */
  modelValue: AppliedQuery<S>;
  /**
   * 重置查询时恢复的初始条件；未传时恢复为空条件。
   * @example `<QueryPanel :initial="defaultQuery" ... />`
   */
  initial?: AppliedQuery<S>;
  /**
   * 当前权限/组织等查询范围的稳定标识；变化时重置本地草稿。
   * @example `<QueryPanel :scope-key="organizationId" ... />`
   */
  scopeKey: string;
  /**
   * 宿主正在加载查询结果时禁用会重复提交的操作。
   * @example `<QueryPanel :loading="controller.state.loading" ... />`
   */
  loading?: boolean;
  /**
   * 受控查询编辑草稿；未传时由组件自行维护。
   * @example `<QueryPanel :draft="draft" @update:draft="draft = $event" ... />`
   */
  draft?: QueryDraft<S>;
}>();
const emit = defineEmits<QueryPanelEmits<S>>();
// 嵌套普通/高级查询输入共享当前面板范围；不创建跨页面单例。
provide(
  queryScopeKey,
  computed(() => props.scopeKey)
);
const slots = defineSlots<
  {
    "commands-start"?: () => unknown;
    "commands-end"?: () => unknown;
  } & {
    [K in Extract<keyof S, string> as `query-${K}`]?: (value: {
      draft: QueryDraft<S>;
      setDraft: (draft: QueryDraft<S>) => void;
    }) => unknown;
  }
>();
const querySlot = (key: string | null) => `query-${key}` as keyof typeof slots;
const localDraft = shallowRef<QueryDraft<S> | undefined>(
  props.draft === undefined ? createQueryDraft(props.schema, props.modelValue) : undefined
);
const draft = computed({
  get: () => props.draft ?? localDraft.value!,
  set: (value: QueryDraft<S>) => {
    if (props.draft === undefined) localDraft.value = value;
    else emit("update:draft", value);
  },
});
function setDraft(value: QueryDraft<S>) {
  draft.value = cloneModel(value);
}
const inlineSearch = computed(() => {
  const node = draft.value.quick[0];
  const field = node ? queryField(props.schema, node.field) : undefined;
  return (
    !!props.compact &&
    draft.value.quick.length === 1 &&
    field?.kind === "text" &&
    !field.input &&
    !slots[querySlot(node!.field ?? "")]
  );
});
const issues = shallowRef<readonly QueryIssue[]>([]);
const filterOpen = ref(false);
const normalOpen = ref(false),
  advancedOpen = ref(false);
const root = ref<HTMLElement>(),
  normalRoot = ref<HTMLElement>(),
  advancedRoot = ref<HTMLElement>();
const where = computed(() => combineQuery(props.modelValue));
const countConditions = (node: QueryNode<S> | null): number =>
  !node
    ? 0
    : node.kind === "condition"
      ? 1
      : node.children.reduce((sum, child) => sum + countConditions(child), 0);
const conditionCount = computed(() => countConditions(where.value));
const hasAdvanced = computed(() =>
  Object.values(props.schema).some((field) => field.entries.includes("advanced"))
);
const fieldFor = (node: QueryDraftCondition<S>) => queryField(props.schema, node.field);
const issue = (id: string) => issues.value.find((item) => item.nodeId === id)?.message;
watch(
  () => props.modelValue,
  (value) => {
    draft.value = createQueryDraft(props.schema, value);
    issues.value = [];
  }
);
watch(
  () => props.scopeKey,
  () => {
    filterOpen.value = false;
    normalOpen.value = false;
    advancedOpen.value = false;
    draft.value = createQueryDraft(props.schema, props.modelValue);
    issues.value = [];
  }
);
function updateFlat(entry: "quick" | "normal", id: string, value: unknown) {
  draft.value = {
    ...draft.value,
    [entry]: draft.value[entry].map((node) => (node.id === id ? { ...node, value } : node)),
  };
}
function openNormal() {
  if (props.loading) return;
  filterOpen.value = false;
  draft.value = { ...draft.value, normal: createQueryDraft(props.schema, props.modelValue).normal };
  issues.value = [];
  normalOpen.value = true;
}
function openAdvanced() {
  if (props.loading) return;
  filterOpen.value = false;
  draft.value = {
    ...draft.value,
    advanced: createQueryDraft(props.schema, props.modelValue).advanced ?? {
      kind: "group",
      id: crypto.randomUUID(),
      operator: "and",
      children: [],
    },
  };
  issues.value = [];
  advancedOpen.value = true;
}
/**
 * 恢复当前查询入口的默认输入，不提交请求、不影响其他入口；取消仍回到已应用条件。
 * @param entry normal 仅重置普通条件；advanced 仅重置高级条件组。
 * @example
 * `resetEntry("normal");`
 */
function resetEntry(entry: "normal" | "advanced") {
  if (props.loading) return;
  const initial = createQueryDraft(props.schema, props.initial ?? emptyAppliedQuery<S>());
  if (entry === "normal") draft.value = { ...draft.value, normal: initial.normal };
  else
    draft.value = {
      ...draft.value,
      advanced: initial.advanced ?? {
        kind: "group",
        id: crypto.randomUUID(),
        operator: "and",
        children: [],
      },
    };
  issues.value = [];
}
function cancelNormal() {
  draft.value = { ...draft.value, normal: createQueryDraft(props.schema, props.modelValue).normal };
  issues.value = [];
}
function cancelAdvanced() {
  draft.value = {
    ...draft.value,
    advanced: createQueryDraft(props.schema, props.modelValue).advanced,
  };
  issues.value = [];
}
async function publish(value: QueryDraft<S>, reason: "apply" | "remove" | "clear" | "reset") {
  if (props.loading) return false;
  const result = applyQueryDraft(props.schema, value);
  if (!result.valid) {
    issues.value = result.issues;
    await nextTick();
    const target = result.issues[0]?.nodeId;
    const wrapper = [root.value, normalRoot.value, advancedRoot.value]
      .flatMap((element) =>
        Array.from(element?.querySelectorAll<HTMLElement>("[data-query-node]") ?? [])
      )
      .find((element) => element.dataset.queryNode === target);
    focusFieldControl(wrapper);
    wrapper?.scrollIntoView({ block: "nearest" });
    return false;
  }
  issues.value = [];
  emit("update:modelValue", cloneModel(result.applied));
  emit("apply", cloneModel(result.applied), reason);
  return true;
}
async function applyEntry(entry: QueryEntry) {
  const candidate = {
    ...createQueryDraft(props.schema, props.modelValue),
    [entry]: cloneModel(draft.value[entry]),
  };
  if (await publish(candidate, "apply")) {
    if (entry === "normal") normalOpen.value = false;
    if (entry === "advanced") advancedOpen.value = false;
  }
}
function removeCondition(id: string) {
  void publish(createQueryDraft(props.schema, removeQueryNode(props.modelValue, id)), "remove");
}
function clear() {
  void publish(createQueryDraft(props.schema, emptyAppliedQuery<S>()), "clear");
}
function restoreDefaults() {
  void publish(createQueryDraft(props.schema, props.initial ?? emptyAppliedQuery<S>()), "reset");
}
function quickEnter(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.defaultPrevented ||
    !(event.target instanceof HTMLInputElement) ||
    !["text", "number", "decimal"].includes(
      event.target.closest<HTMLElement>("[data-kind]")?.dataset.kind ?? ""
    )
  )
    return;
  event.preventDefault();
  void applyEntry("quick");
}
/** 聚焦查询区公共根节点，调用方不读取内部输入控件。 */
function focus() {
  root.value?.focus();
}
defineExpose({ clear, reset: restoreDefaults, apply: applyEntry, focus });
</script>
<style scoped lang="scss">
.query-panel__dialog-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.query-panel__dialog-footer > button {
  margin: 0;
}
.query-panel__footer-spacer {
  flex: 1;
}
.query-panel {
  min-width: 0;
  /* 紧凑工具栏由可用列宽决定，嵌入抽屉时不误判为桌面布局。 */
  container-type: inline-size;
}

.query-panel__search-group {
  display: contents;
}

.query-panel--compact .query-panel__quick {
  align-items: center;
  gap: 8px;
}

.query-panel--compact .query-panel__search-group {
  display: flex;
  align-items: center;
  flex: 0 1 280px;
  min-width: 160px;
  max-width: 280px;
  gap: 4px;
}

.query-panel--compact .query-panel__fields {
  min-width: 0;
  flex: 1;
}

.query-panel--compact .query-panel__fields > .query-panel__field {
  max-width: none;
}

.query-panel--compact .query-panel__commands-start {
  flex-shrink: 0;
  flex-wrap: nowrap;
}

.query-panel--compact .query-panel__commands-end {
  flex-shrink: 0;
  flex-wrap: nowrap;
}

.query-panel__icon-button {
  width: 32px;
  padding: 0;
}

.query-panel__chevron {
  margin-left: 6px;
}

.query-panel__filter-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.query-panel__filter-menu > button {
  margin: 0;
  justify-content: flex-start;
}

.query-panel__filter-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}

.query-panel__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: flex-end;
}

.query-panel__commands-start,
.query-panel__commands-end,
.query-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.query-panel__commands-start {
  flex: 0 1 auto;
}

.query-panel__commands-end {
  flex: 0 1 auto;
  justify-content: flex-end;
  margin-left: auto;
}

.query-panel__fields {
  display: flex;
  flex: 1 1 200px;
  gap: 12px;
  min-width: 180px;
}

.query-panel__field {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  font-size: 13px;
}

.query-panel__fields > .query-panel__field {
  flex: 1 1 180px;
  max-width: 320px;
}

.query-panel__actions {
  flex: 0 1 auto;
  padding-bottom: 1px;
}

.query-panel__actions :deep(.el-button) {
  margin: 0;
}

.query-panel__normal {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.query-panel__normal-shell {
  container-type: inline-size;
}

.query-panel__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.query-panel__status {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.query-panel__refresh-icon {
  width: 15px;
  height: 15px;
  margin-right: 6px;
}

.query-status-enter-active,
.query-status-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.query-status-enter-from,
.query-status-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}

.query-panel__error {
  color: var(--el-color-danger);
}

@container (max-width: 480px) {
  .query-panel__commands-start,
  .query-panel__commands-end,
  .query-panel__fields,
  .query-panel__actions {
    flex-basis: 100%;
    width: 100%;
  }

  .query-panel__commands-end {
    justify-content: flex-start;
    margin-left: 0;
  }

  .query-panel__fields > .query-panel__field {
    max-width: none;
    flex-basis: 100%;
  }

  .query-panel__normal {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 480px) {
  .query-panel--compact .query-panel__commands-start,
  .query-panel--compact .query-panel__commands-end {
    flex-basis: auto;
    width: auto;
  }

  .query-panel--compact .query-panel__commands-end {
    margin-left: auto;
  }

  .query-panel--compact .query-panel__search-group {
    order: 3;
    flex-basis: 180px;
    max-width: none;
  }

  .query-panel--compact .query-panel__filter-trigger {
    order: 4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .query-status-enter-active,
  .query-status-leave-active {
    transition: none;
  }
}
</style>
