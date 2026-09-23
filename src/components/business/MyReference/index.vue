<template>
  <!-- 选择客户、商品等业务记录。v-model 保存 ID；source 提供搜索和回显；filters/scopeKey 指定范围。加 readonly 只显示已选内容。 -->
  <div ref="root" class="my-reference">
    <div class="my-reference__control">
      <el-popover
        :visible="active && state.typing.value && !state.locked.value"
        placement="bottom-start"
        :width="Math.max(width, 260)"
        :show-arrow="false"
        popper-class="my-reference-candidates"
        :popper-style="{ maxWidth: 'calc(100vw - 32px)' }"
      >
        <template #reference>
          <div class="my-reference__input" @focusout="cancelInput">
            <el-input
              ref="inputRef"
              :model-value="state.typing.value ? state.keyword.value : state.label.value"
              :placeholder="placeholder ?? '输入关键字或选择'"
              :disabled="disabled"
              :readonly="readonly"
              :aria-label="source.title"
              container-role="combobox"
              aria-autocomplete="list"
              :aria-expanded="state.typing.value"
              :aria-controls="listId"
              :aria-activedescendant="
                state.activeIndex.value >= 0 ? `${listId}-${state.activeIndex.value}` : undefined
              "
              @input="onInput"
              @compositionstart="state.compositionStart"
              @compositionend="onCompositionEnd"
              @keydown="onKeydown"
              @blur="cancelInput"
            >
              <template v-if="!readonly" #suffix>
                <el-button
                  v-if="clearable !== false && state.committedIds.value.length > 0"
                  text
                  size="small"
                  :disabled="disabled || state.guarding.value"
                  :aria-label="`清空${source.title}`"
                  :title="`清空${source.title}`"
                  @mousedown.prevent
                  @click="state.commit()"
                >
                  <el-icon><Close /></el-icon>
                </el-button>
              </template>
            </el-input>
          </div>
        </template>
        <div @mousedown.prevent>
          <p
            v-if="state.composing.value || state.keyword.value.trim().length < (minChars ?? 1)"
            class="my-reference__hint"
          >
            请继续输入关键字
          </p>
          <p v-else-if="state.suggesting.value" role="status">正在查询…</p>
          <div v-else-if="state.suggestError.value" role="alert">
            {{ state.suggestError.value }}
            <el-button link type="primary" @click="state.suggest">重试候选</el-button>
          </div>
          <p v-else-if="!state.suggestions.value.length">当前范围没有匹配记录，请调整搜索条件。</p>
          <ul
            :id="listId"
            role="listbox"
            :aria-multiselectable="multiple || undefined"
            :aria-label="`${source.title}候选`"
            class="my-reference__options"
          >
            <li
              v-for="(row, index) in state.suggestions.value"
              :id="`${listId}-${index}`"
              :key="serializeStableKey(source.getKey(row))"
              role="option"
              :aria-selected="state.isSelected(row)"
              :aria-disabled="!state.choiceAvailability(row).allowed"
              :class="{
                'is-active': index === state.activeIndex.value,
                'is-disabled': !state.choiceAvailability(row).allowed,
              }"
              @click="state.commit(row)"
            >
              <div class="my-reference__option">
                <span v-if="multiple" class="my-reference__check" aria-hidden="true">
                  {{ state.isSelected(row) ? "☑" : "☐" }}
                </span>
                <div>
                  <slot name="option" :row="row">
                    <span :title="source.getLabel(row)">{{ source.getLabel(row) }}</span>
                    <small>
                      {{ source.getDescription?.(row) }}
                      {{ state.isSelected(row) ? " · 已选" : "" }}
                    </small>
                  </slot>
                  <small v-if="!state.choiceAvailability(row).allowed">
                    {{ state.choiceAvailability(row).reason ?? "不可选择" }}
                  </small>
                </div>
              </div>
            </li>
          </ul>
          <el-button link type="primary" @click="state.open">打开完整选择</el-button>
          <el-button
            v-if="navigation?.create && !readonly"
            link
            type="primary"
            :loading="navigator.busy.value"
            @click="createRelated"
          >
            {{ createLabel }}
          </el-button>
        </div>
      </el-popover>
      <el-button
        v-if="!readonly"
        :disabled="disabled"
        :loading="state.guarding.value && !state.visible.value"
        :aria-label="`选择${source.title}`"
        :title="`选择${source.title}`"
        class="my-reference__trigger"
        @click="state.open"
      >
        <el-icon><MoreFilled /></el-icon>
      </el-button>
    </div>
    <el-button
      v-if="!multiple && state.selected.value && navigation?.view"
      class="my-reference__view"
      link
      type="primary"
      :disabled="navigator.busy.value"
      :aria-label="`查看${source.getLabel(state.selected.value)}`"
      :title="`查看${source.getLabel(state.selected.value)}`"
      @click.stop="viewRelated(state.selected.value)"
    >
      ↗
    </el-button>
    <p v-if="navigator.error.value" role="status" class="my-reference__error">
      {{ navigator.error.value }}
    </p>
    <p v-if="state.resolveError.value" role="alert" class="my-reference__error">
      {{ state.resolveError.value }}
      <el-button type="primary" link @click="state.resolveSelection(true)">重试回显</el-button>
    </p>
    <p
      v-if="state.guardError.value && !state.visible.value"
      role="alert"
      class="my-reference__error"
    >
      {{ state.guardError.value }}
    </p>
    <p v-if="state.modelError.value" role="alert" class="my-reference__error">
      {{ state.modelError.value }}
    </p>
    <div v-if="multiple" class="my-reference__tags" aria-label="已提交选择">
      <el-tag
        v-for="id in state.committedIds.value"
        :key="serializeStableKey(id)"
        :closable="!state.locked.value && !state.guarding.value"
        @close="state.remove(id)"
      >
        <slot
          v-if="state.resolvedRecords.value.get(id)"
          name="selected"
          :row="state.resolvedRecords.value.get(id)!"
        >
          {{ source.getLabel(state.resolvedRecords.value.get(id)!) }}
        </slot>
        <el-button
          v-if="navigation?.view && state.resolvedRecords.value.get(id)"
          class="my-reference__tag-view"
          link
          type="primary"
          :disabled="navigator.busy.value"
          :aria-label="`查看${source.getLabel(state.resolvedRecords.value.get(id)!)}`"
          @click.stop="viewRelated(state.resolvedRecords.value.get(id)!)"
        >
          ↗
        </el-button>
        <span v-if="!state.resolvedRecords.value.get(id)">
          {{
            state.resolveError.value
              ? "回显失败"
              : state.pendingIds.value.includes(id)
                ? "加载中"
                : "记录不可用"
          }}
        </span>
      </el-tag>
    </div>
    <slot v-else-if="state.selected.value" name="selected" :row="state.selected.value" />
    <MyDialog
      :model-value="active && state.visible.value"
      v-model:fullscreen="dialogFullscreen"
      :title="`选择${source.title}`"
      width="960px"
      class="my-reference-dialog"
      :confirm-loading="state.guarding.value"
      :confirm-disabled-reason="confirmDisabledReason"
      @update:model-value="closeDialog"
      @confirm="state.commitIds(state.draftIds.value)"
      @closed="focus"
    >
      <div ref="dialogContent" class="my-reference__dialog-content">
        <div v-if="source.query" class="my-reference__query-panel">
          <QueryPanel
            ref="queryPanel"
            compact
            :schema="source.query.schema"
            :model-value="state.queryApplied.value"
            :scope-key="scopeKey"
            :loading="state.searching.value"
            @apply="state.applyQuery"
            @refresh="state.search"
          >
            <template #commands-end>
              <el-button
                v-if="navigation?.create && !readonly"
                class="my-reference__command"
                plain
                type="primary"
                :icon="TopRight"
                :loading="navigator.busy.value"
                @click="createRelated"
              >
                {{ createLabel }}
              </el-button>
            </template>
          </QueryPanel>
        </div>
        <div v-else class="my-reference__query">
          <el-input
            ref="dialogInput"
            v-model="state.dialogKeyword.value"
            :aria-label="`${source.title}弹窗关键字`"
            placeholder="输入名称或编码"
            clearable
            @keyup.enter="query"
          />
          <div class="my-reference__query-actions">
            <el-button
              class="my-reference__command"
              type="primary"
              :loading="state.searching.value"
              @click="query"
            >
              查询
            </el-button>
            <el-button class="my-reference__command" @click="state.resetSearch">重置</el-button>
            <el-button
              v-if="navigation?.create && !readonly"
              class="my-reference__command"
              plain
              type="primary"
              :icon="TopRight"
              :loading="navigator.busy.value"
              @click="createRelated"
            >
              {{ createLabel }}
            </el-button>
          </div>
        </div>
        <ReferenceSearchFields
          v-if="!source.query"
          v-model="state.conditionValues.value"
          :fields="source.searchFields ?? []"
        />
        <p v-if="navigator.error.value" role="status">{{ navigator.error.value }}</p>
        <div v-if="state.searchError.value" role="alert" class="my-reference__error">
          {{ state.searchError.value }}
          <el-button link type="primary" @click="state.search">重试查询</el-button>
        </div>
        <div
          class="my-reference__body"
          :class="{ 'has-selection': multiple }"
          :style="{ '--reference-table-height': tableHeight + 'px' }"
        >
          <div class="my-reference__results">
            <TableView
              :rows="state.rows.value"
              :columns="columns"
              :get-row-key="source.getKey"
              :loading="state.searching.value"
              :current-row-key="state.draft.value ? source.getKey(state.draft.value) : null"
              :height="tableHeight"
              size="small"
              @row-click="state.chooseDraft($event.row)"
            >
              <template #empty>
                <div v-if="state.searchError.value">加载失败，请重试查询。</div>
                <div v-else-if="!state.searching.value" class="my-reference__empty">
                  <p>当前范围没有匹配记录，请调整搜索条件。</p>
                  <el-button link type="primary" @click="adjustSearch">调整搜索</el-button>
                  <el-button link @click="state.resetSearch">清除搜索条件</el-button>
                </div>
              </template>
              <template v-for="column in source.columns" #[`header-${column.key}`]>
                <el-checkbox
                  v-if="multiple && column === source.columns[0]"
                  :model-value="state.pageAll.value"
                  :indeterminate="state.pageSome.value"
                  :disabled="
                    state.guarding.value || state.searching.value || !state.pageIds.value.length
                  "
                  @change="state.togglePage"
                >
                  全选当前页
                </el-checkbox>
                <span v-else>{{ column.label }}</span>
              </template>
              <template v-for="column in source.columns" #[`column-${column.key}`]="{ row }">
                <el-button
                  v-if="!multiple && column === source.columns[0]"
                  link
                  type="primary"
                  :disabled="!state.eligible(row).allowed"
                  :aria-label="`暂选${source.getLabel(row)} ${source.getDescription?.(row) ?? ''}`"
                  @click.stop="state.chooseDraft(row)"
                >
                  <slot :name="`column-${column.key}`" :row="row">
                    {{ column.format ? column.format(row) : row[column.key] }}
                  </slot>
                </el-button>
                <span v-else-if="multiple && column === source.columns[0]" @click.stop>
                  <el-checkbox
                    :model-value="state.isSelected(row, true)"
                    :disabled="state.guarding.value || !state.choiceAvailability(row, true).allowed"
                    :aria-label="`暂选${source.getLabel(row)} ${source.getDescription?.(row) ?? ''}`"
                    @change="state.chooseDraft(row)"
                  >
                    <slot :name="`column-${column.key}`" :row="row">
                      {{ column.format ? column.format(row) : row[column.key] }}
                    </slot>
                  </el-checkbox>
                </span>
                <slot v-else :name="`column-${column.key}`" :row="row">
                  {{ column.format ? column.format(row) : row[column.key] }}
                </slot>
                <small v-if="column === source.columns[0] && !state.eligible(row).allowed">
                  （{{ state.eligible(row).reason ?? "不可选择" }}）
                </small>
              </template>
            </TableView>
            <Pagination
              v-model:page="state.page.value"
              v-model:limit="state.limit.value"
              :total="state.total.value"
              :disabled="state.searching.value"
              layout="total, prev, pager, next"
              @pagination="state.search"
            />
          </div>
          <details v-if="multiple" class="my-reference__chosen" :open="dialogWidth >= 768">
            <summary>
              已选 {{ state.draftIds.value.length }} 项{{
                maxSelected === undefined ? "" : ` / 最多 ${maxSelected} 项`
              }}
            </summary>
            <el-button
              link
              type="danger"
              :disabled="state.guarding.value || !state.draftIds.value.length"
              @click="state.clearDraft"
            >
              清空待选
            </el-button>
            <ul>
              <li v-for="id in state.draftIds.value" :key="serializeStableKey(id)">
                <span>
                  {{
                    state.draftRecords.value.get(id)
                      ? source.getLabel(state.draftRecords.value.get(id)!)
                      : "记录不可用"
                  }}
                </span>
                <small
                  v-if="state.validationUnavailableIds.value.includes(id)"
                  class="my-reference__error"
                >
                  记录不可用
                </small>
                <el-button
                  link
                  :disabled="state.guarding.value"
                  :aria-label="`移除待选 ${id}`"
                  @click="state.removeDraft(id)"
                >
                  移除
                </el-button>
              </li>
            </ul>
          </details>
        </div>
        <p v-if="!multiple" role="status">
          {{
            state.draft.value
              ? `待确认：${source.getLabel(state.draft.value)} ${source.getDescription?.(state.draft.value) ?? ""}`
              : "请选择一条记录，再点击确定"
          }}
        </p>
        <p v-if="state.guardError.value" role="alert" class="my-reference__error">
          {{ state.guardError.value }}
        </p>
      </div>
    </MyDialog>
  </div>
</template>

<script
  setup
  lang="ts"
  generic="
    Row extends object,
    Id extends ReferenceId,
    F extends ReferenceFilters,
    Multiple extends boolean = false
  "
>
import { ref, useId, watch, nextTick, onActivated, onDeactivated } from "vue";
import { useBusinessNavigation } from "@/composables/useBusinessNavigation";
import { getBusinessTarget } from "@/router/business-targets";
import { Close, MoreFilled, TopRight } from "@element-plus/icons-vue";
import { useElementSize } from "@vueuse/core";
import type { InputInstance } from "element-plus";
import type {
  ReferenceInputProps,
  ReferenceId,
  ReferenceFilters,
  ReferenceEmits,
  ReferenceExpose,
} from "./types";
import { useReference } from "./useReference";
import { serializeStableKey } from "@/utils/identity";
import TableView from "@/components/table/TableView.vue";
import ReferenceSearchFields from "./ReferenceSearchFields.vue";
import Pagination from "@/components/common/Pagination.vue";
import MyDialog from "@/components/common/MyDialog.vue";
import QueryPanel from "@/components/business/search/QueryPanel.vue";
const props = withDefaults(defineProps<ReferenceInputProps<Row, Id, F, Multiple>>(), {
  clearable: true,
});
const emit = defineEmits<ReferenceEmits<Row, Id, Multiple>>();
defineSlots<
  {
    option?: (props: { row: Readonly<Row> }) => unknown;
    selected?: (props: { row: Readonly<Row> }) => unknown;
  } & { [name: `column-${string}`]: (props: { row: Readonly<Row> }) => unknown }
>();
/** 参照输入所在元素，用于按实际宽度安排候选浮层。 */
const root = ref<HTMLElement>();
/** 当前组件所在标签是否可见，防止后台页面抢焦点或处理关闭事件。 */
const active = ref(true);
/** 缓存页面重新显示时恢复交互和焦点处理。 */
onActivated(() => {
  active.value = true;
});
/** 切换标签时停止输入候选，避免候选浮层留在其他页面上。 */
onDeactivated(() => {
  active.value = false;
  state.stopTyping();
});
/** 处理查看和前往新增的跳转，返回来源页面时尝试把焦点放回参照输入。 */
const navigator = useBusinessNavigation(focus);
/** 旧式弹窗关键词输入实例，调整查询时可直接聚焦。 */
const dialogInput = ref<InputInstance>();
/** 新查询面板的公开 focus 方法，用于把焦点放到筛选输入。 */
const queryPanel = ref<{ focus: () => void }>();
/** 生成“前往新增”按钮文案，优先使用页面自定义标题。 */
const createLabel = computed(
  () =>
    props.navigation?.createLabel ??
    `前往新增${getBusinessTarget(props.navigation?.create ?? "")?.title ?? props.source.title}`
);
/** 按当前记录 ID 计算查看目标，并交给统一导航打开详情。 */
function viewRelated(row: Readonly<Row>) {
  const target = props.navigation?.view?.(props.source.getKey(row), row);
  if (target) void navigator.open(target);
}
/** 打开目标模块新增；保存返回后仅在来源范围和选择未变化时尝试选入新 ID。 */
function createRelated() {
  if (props.readonly || !props.navigation?.create) return;
  const scope = props.scopeKey;
  const source = props.source;
  const selection = JSON.stringify(props.modelValue);
  const parseId = props.navigation.createdId;
  void navigator.open({ target: props.navigation.create, action: "create" }, async (savedId) => {
    // 来源范围或用户选择已经改变时，不用新建结果覆盖新状态。
    if (
      !parseId ||
      props.readonly ||
      props.scopeKey !== scope ||
      props.source !== source ||
      JSON.stringify(props.modelValue) !== selection
    )
      return;
    const id = parseId(savedId);
    if (id === null) return;
    const ids = props.multiple ? [...state.committedIds.value, id] : [id];
    if (!(await state.commitIds(ids)))
      throw new Error("记录已保存，但未能选入来源字段，请返回后重新选择");
  });
}
/** 按数据源使用的新旧查询界面，把焦点放到对应搜索框。 */
function adjustSearch() {
  if (props.source.query) queryPanel.value?.focus();
  else dialogInput.value?.focus();
}
/** 测量输入区域宽度，让候选浮层与输入框大小匹配。 */
const { width } = useElementSize(root);
/** 选择弹窗的内容元素，用于根据容器宽度安排列表和已选区域。 */
const dialogContent = ref<HTMLElement>();
/** 测量弹窗正文的实际宽度，而不是只按浏览器宽度判断是否应紧凑显示。 */
const { width: dialogWidth } = useElementSize(dialogContent);
/** 记录选择弹窗是否全屏，使布局随全屏切换更新。 */
const dialogFullscreen = ref(false);
// 多选首列同时承载复选框与编码，保留最小宽度并允许表格横向滚动。
const columns = computed(() =>
  props.source.columns.map((column, index) =>
    props.multiple && index === 0
      ? {
          ...column,
          width: column.width === undefined ? undefined : Math.max(150, column.width),
          minWidth: Math.max(150, column.minWidth ?? 0),
        }
      : { ...column, minWidth: column.minWidth ?? 100 }
  )
);
/** 窄弹窗采用较矮的候选列表，宽弹窗固定高度，避免结果数量变化时界面跳动。 */
const tableHeight = computed(() => {
  if (dialogWidth.value < 768) return 200;
  // 候选区不随结果条数伸缩；极矮窗口由 MyDialog 的公共滚动容器兜底。
  // 不监听全局窗口 resize，TableView 继续通过自身 ResizeObserver 测量可用区域。
  return 360;
});
/** 说明为什么暂时不能确认，例如单选未选择、正在回显或查询失败。 */
const confirmDisabledReason = computed(() => {
  if (!props.multiple && !state.draftIds.value.length) return "请先选择一条记录";
  if (state.resolving.value) return "正在校验已选记录";
  if (state.searchError.value) return "请先处理查询错误";
  return undefined;
});
/** 主参照输入框实例，对外 focus 和跳转返回后用它恢复焦点。 */
const inputRef = ref<InputInstance>();
/** 为本组件生成唯一候选列表 ID，关联输入框和键盘高亮项。 */
const listId = `reference-${useId()}`;
/** 复用参照的搜索、回显和暂选逻辑，并把值变化等事件通知页面。 */
const state = useReference(props, {
  update: (value) => emit("update:modelValue", value),
  commit: (value) => emit("commit", value),
  resolve: (value) => emit("resolve", value),
  error: (value) => emit("error", value),
  open: (value) => emit("open-change", value),
});
/** 键盘高亮项变化后，等待候选 DOM 更新，再把它滚动到可见位置。 */
watch(state.activeIndex, async (index) => {
  await nextTick();
  if (index >= 0)
    document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" });
});
/** 输入框失焦时结束候选模式；弹窗正在接管焦点时保留当前操作。 */
function cancelInput() {
  // 弹窗接管焦点时不终止刚建立的查询会话。
  if (!state.visible.value) state.stopTyping();
}
/** 仅在组件可见且弹窗关闭时聚焦主输入，避免后台标签抢焦点。 */
function focus() {
  if (active.value && !state.visible.value) inputRef.value?.focus();
}
/** 收到关闭请求时结束弹窗暂选；忽略来自后台缓存页面的关闭变化。 */
function closeDialog(value: boolean) {
  if (!value && active.value) state.close();
}
/** 输入法组合期间不搜索，其余输入交给候选搜索逻辑。 */
function onInput(text: string) {
  if (!state.composing.value) state.input(text);
}
/** 输入法确认后读取最终文字，再开始候选查询。 */
function onCompositionEnd(event: CompositionEvent) {
  state.input((event.target as HTMLInputElement).value);
}
/** 用户重新查询时回到第一页，避免新条件继续停留在旧页码。 */
function query() {
  state.page.value = 1;
  void state.search();
}
/** 支持上下键选择候选、Enter 确认和 Escape 退出，并避免干扰输入法。 */
function onKeydown(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) return;
  if (event.isComposing || state.composing.value) return;
  if (event.key === "Escape" && state.typing.value) {
    event.preventDefault();
    event.stopPropagation();
    state.stopTyping();
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    state.moveActive(event.key === "ArrowDown" ? 1 : -1);
  }
  if (event.key === "Enter" && state.typing.value) {
    event.preventDefault();
    const item = state.suggestions.value[state.activeIndex.value];
    if (item) void state.commit(item);
  }
}
defineExpose<ReferenceExpose>({
  open: state.open,
  close: state.close,
  focus,
  clear: () => state.commit(),
  reload: () => {
    void state.resolveSelection(true);
    if (state.visible.value) void state.search();
    else if (state.typing.value) void state.suggest();
  },
  validateSelection: () => state.resolveSelection(true),
});
</script>

<style scoped lang="scss">
.my-reference {
  position: relative;
  &__view {
    position: absolute;
    right: -26px;
    top: 4px;
    min-width: 24px;
    min-height: 24px;
  }
  &__tag-view {
    min-width: 24px;
    min-height: 24px;
  }
  &:has(.my-reference__view) {
    width: calc(100% - 28px);
  }
  width: 100%;
  &__input {
    width: 100%;
    min-width: 0;
  }
  &__trigger {
    flex: 0 0 var(--el-component-size);
    width: var(--el-component-size);
    padding: 0;
    margin: 0;
  }
  &__option {
    display: flex;
    gap: 8px;
    > div {
      flex: 1;
      min-width: 0;
    }
  }
  &__body.has-selection {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 16px;
    height: calc(var(--reference-table-height) + 56px);
    align-items: stretch;
  }
  &__dialog-content {
    min-width: 0;
    container-type: inline-size;
  }
  &__results {
    min-width: 0;
  }
  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 120px;
    overflow: auto;
    margin-top: 8px;
  }
  &__chosen {
    box-sizing: border-box;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    padding: 10px;
    min-width: 0;
    summary {
      cursor: pointer;
      margin-bottom: 8px;
    }
    ul {
      padding: 0;
      margin: 8px 0;
      list-style: none;
      max-height: calc(100% - 78px);
      overflow: auto;
    }
    li {
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    li > span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }
  @container (max-width: 767px) {
    &__body.has-selection {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
    }
    &__chosen {
      height: auto;
      max-height: 260px;
    }
    &__chosen ul {
      max-height: 170px;
    }
    &__query {
      flex-wrap: wrap;
    }
    &__query > :first-child {
      flex-basis: 100%;
    }
    &__query-actions {
      width: 100%;
    }
  }
  min-width: 0;
  &__control,
  &__query {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__control > :first-child {
    flex: 1;
    min-width: 0;
  }
  &__query {
    margin-bottom: 12px;
  }
  &__query > :first-child {
    flex: 1;
    min-width: 160px;
  }
  &__query-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  &__command {
    margin: 0;
    white-space: nowrap;
  }
  &__query-panel {
    margin-bottom: 12px;
  }
  &__error {
    color: var(--el-color-danger);
    font-size: 13px;
  }
  &__hint {
    color: var(--el-text-color-secondary);
  }
  &__options {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
    max-height: 280px;
    overflow: auto;
    li {
      padding: 8px;
      cursor: pointer;
      border-radius: var(--el-border-radius-base);
    }
    li:hover,
    .is-active {
      background: var(--el-color-primary-light-9);
    }
    .is-disabled {
      cursor: not-allowed;
      color: var(--el-text-color-disabled);
    }
    span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      overflow-wrap: anywhere;
      display: block;
      color: var(--el-text-color-secondary);
    }
  }
}
</style>
