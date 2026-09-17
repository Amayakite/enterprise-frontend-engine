<template>
  <section class="crud-list">
    <QueryPanel
      class="crud-list__commandbar"
      compact
      :schema="config.query.schema"
      :model-value="applied"
      :draft="draft"
      :initial="config.query.initial"
      :scope-key="scopeKey"
      :loading="controller.state.loading || !!batch?.busy"
      @update:draft="onQueryDraftUpdate"
      @apply="apply"
      @refresh="onQueryRefresh"
    >
      <template #commands-start>
        <span
          v-if="navigation?.add && createPermitted !== false"
          ref="createTarget"
          class="crud-list__create-target"
        >
          <el-button type="primary" :icon="Plus" :disabled="busy" @click="onCreate">新增</el-button>
        </span>
        <el-popover
          v-if="
            toolbarActions.length ||
            slots['toolbar-left'] ||
            batch ||
            controller.state.selectedKeys.length
          "
          trigger="click"
          placement="bottom-start"
          :width="300"
        >
          <template #reference>
            <el-button
              :type="controller.state.selectedKeys.length ? 'primary' : undefined"
              :plain="!!controller.state.selectedKeys.length"
            >
              {{
                controller.state.selectedKeys.length
                  ? `已选 ${controller.state.selectedKeys.length} 项 · 操作`
                  : "更多操作"
              }}
              <el-icon class="crud-list__chevron">
                <ArrowDown />
              </el-icon>
            </el-button>
          </template>
          <div class="crud-list__operation-menu" aria-label="列表操作">
            <el-button
              v-if="controller.state.selectedKeys.length"
              link
              :icon="Close"
              :disabled="busy"
              @click="controller.select([])"
            >
              清空选择
            </el-button>
            <template v-for="action in toolbarActions" :key="action.key">
              <ActionButton
                :label="action.label"
                :tone="action.tone"
                :icon="action.icon ?? Operation"
                :disabled-reason="controller.actionAvailability(action.key).reason"
                :loading="controller.state.busyActionKey === action.key"
                @click="controller.runAction(action.key)"
              />
            </template>
            <slot name="toolbar-left" v-bind="controller" />
            <MyBatchActions v-if="batch" :controller="batch" />
          </div>
        </el-popover>
      </template>
      <template #commands-end>
        <slot name="toolbar-right" v-bind="controller" />
        <el-tooltip content="列设置">
          <el-button
            class="crud-list__icon-button"
            :icon="Setting"
            aria-label="列设置"
            @click="columnSettingsOpen = true"
          />
        </el-tooltip>
      </template>
      <template v-for="key in querySlots" :key="key" #[key]>
        <slot :name="key" :draft="controller.state.draft" :set-draft="controller.setDraft" />
      </template>
    </QueryPanel>
    <MyFeedback
      v-if="pageIntent.intent.value"
      :message="intentMessage"
      :tone="intentTone"
      :next-step="intentNextStep"
    >
      <el-button v-if="pageIntent.intent.value.source" link type="primary" @click="pageIntent.back">
        返回{{ pageIntent.intent.value.source.title }}
      </el-button>
      <el-button link aria-label="关闭操作提示" @click="pageIntent.dismiss">关闭</el-button>
    </MyFeedback>
    <PageActionGuide
      v-if="
        pageIntent.guiding.value &&
        pageIntent.active.value &&
        createPermitted !== false &&
        guideMode !== false &&
        !columnSettingsOpen
      "
      :key="pageIntent.intent.value?.token"
      :target="createTarget"
      :ready="!busy && !!navigation?.add"
      :mode="guideMode || 'halo'"
      :message="`点击这里新增${pageIntent.title.value ?? ''}`"
      @finish="pageIntent.finish"
    />
    <MyFeedback v-if="preferences.status.value" :message="preferences.status.value" tone="warning">
      <el-button
        v-if="preferences.retryable.value"
        link
        type="primary"
        :loading="preferences.syncing.value"
        @click="preferences.retry"
      >
        重试同步
      </el-button>
    </MyFeedback>
    <MyFeedback
      v-if="controller.state.error || navigationError"
      :message="controller.state.error || navigationError || ''"
      :tone="controller.actionResult ? 'warning' : 'error'"
    />
    <MyFeedback
      v-if="controller.actionResult && !controller.state.error && !navigationError"
      :message="actionMessage"
      :tone="controller.actionResult.failed?.length ? 'warning' : 'success'"
      :next-step="
        controller.actionResult.failed?.length
          ? '请核对未完成项，已完成项无需重复处理。'
          : undefined
      "
    />
    <div class="crud-list__table">
      <MyTable
        :rows="rows"
        :columns="preferences.columns.value"
        :fields="config.fields"
        :context="context"
        :get-row-key="config.getKey"
        :loading="busy"
        :wrap-cells="preferences.density.value === 'comfortable'"
        height="100%"
        :sort="sort"
        :selection="selection"
        :density="preferences.density.value"
        @sort-change="onSortChange"
        @selection-change="onSelectionChange"
        @column-resize="onColumnResize"
      >
        <template
          v-for="column in config.columns.filter(
            (item) => slots[columnSlot(item.key)] || item.link || item.secondary
          )"
          :key="column.key"
          #[`column-${column.key}`]="cell"
        >
          <slot
            :name="columnSlot(column.key)"
            :row="readonlyRow(cell.row)"
            :row-key="cell.rowKey"
            :value="cell.row[column.key]"
          >
            <CrudCell
              :row="cell.row"
              :column="column"
              :field="config.fields?.find((item) => item.key === column.key)"
              :context="context"
              :navigate="!!(column.link && navigation?.[column.link])"
              :disabled="busy"
              @navigate="navigate(() => navigation![column.link!]!(cell.rowKey))"
            />
          </slot>
        </template>
        <template
          v-if="navigation?.detail || navigation?.edit || rowActions.length"
          #actions="{ rowKey }"
        >
          <el-button
            v-if="navigation?.detail"
            link
            type="primary"
            :disabled="busy"
            @click="navigate(() => navigation!.detail!(rowKey))"
          >
            详情
          </el-button>
          <ActionButton
            v-if="navigation?.edit"
            label="编辑"
            tone="primary"
            :disabled="busy"
            :disabled-reason="editDisabledReason(rowKey)"
            @click="navigate(() => navigation!.edit!(rowKey))"
          />
          <el-dropdown
            v-if="
              rowActions.some((action) => controller.actionAvailability(action.key, rowKey).visible)
            "
            :disabled="busy"
            trigger="click"
            @command="controller.runAction($event, rowKey)"
          >
            <el-button link type="primary" :disabled="busy">更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <template v-for="action in rowActions" :key="action.key">
                  <el-dropdown-item
                    v-if="controller.actionAvailability(action.key, rowKey).visible"
                    :command="action.key"
                    :disabled="!!controller.actionAvailability(action.key, rowKey).reason"
                  >
                    <span :title="controller.actionAvailability(action.key, rowKey).reason">
                      {{ action.label
                      }}{{
                        controller.actionAvailability(action.key, rowKey).reason
                          ? `（${controller.actionAvailability(action.key, rowKey).reason}）`
                          : ""
                      }}
                    </span>
                  </el-dropdown-item>
                </template>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </MyTable>
    </div>
    <div class="crud-list__footer">
      <span>已选 {{ controller.state.selectedKeys.length }} 项</span>
      <Pagination
        :disabled="busy"
        :page-sizes="[10, 20, 50, 100]"
        :page="controller.state.pageNum"
        :limit="controller.state.pageSize"
        :total="controller.state.total"
        @pagination="onPagination"
      />
    </div>
    <CrudColumnSettingsDialog
      v-model="columnSettingsOpen"
      :columns="config.columns"
      :items="preferences.items.value"
      :defaults="preferences.defaults()"
      :density="preferences.density.value"
      :has-selection="!!selection"
      :has-actions="!!(navigation?.detail || navigation?.edit || rowActions.length)"
      @apply="preferences.apply"
    />
    <MyBusinessPageHost v-if="host" v-bind="host" />
  </section>
</template>
<script
  setup
  lang="ts"
  generic="
    Row extends object,
    Id extends string | number,
    S extends QuerySchema,
    Scope,
    QueryDTO,
    C
  "
>
import { computed, onMounted, readonly, ref } from "vue";
import PageActionGuide from "../PageActionGuide.vue";
import MyFeedback from "../feedback/MyFeedback.vue";
import { usePageIntent } from "@/composables/usePageIntent";
import { useFieldDictionaries } from "@/composables/useFieldDictionaries";
import MyBatchActions from "./MyBatchActions.vue";
import type { BatchController } from "./batch";
import { Plus, Setting, ArrowDown, Close, Operation } from "@element-plus/icons-vue";
import { diagnoseCrudSlots } from "./config";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import { createQueryDraft } from "@/components/business/search/model";
import QueryPanel from "@/components/business/search/QueryPanel.vue";
import MyTable from "@/components/table/MyTable.vue";
import Pagination from "@/components/common/Pagination.vue";
import ActionButton from "@/components/business/ActionButton.vue";
import CrudCell from "./CrudCell.vue";
import CrudColumnSettingsDialog from "./CrudColumnSettingsDialog.vue";
import MyBusinessPageHost from "./MyBusinessPageHost.vue";
import { useCrudColumns, type CrudColumnIdentity } from "@/composables/useCrudColumns";
import type { AppliedQuery, QueryDraft, QuerySchema } from "@/components/business/search/types";
import type { TableSort } from "@/components/table/types";
import type { CrudListConfig, CrudListController, CrudListSlots, CrudNavigation } from "./types";
import type { CrudViewEnvironment } from "./crud-page";
const props = defineProps<{
  /** 标准装配层的新增权限；省略保持独立列表原行为。 */
  createPermitted?: boolean;
  /** 导航意图视觉效果；默认 halo，false 仅文字说明。 */
  guideMode?: "halo" | "spotlight" | false;
  /**
   * 当前列表自动消费的弹窗/抽屉宿主；标准 useCrudView 会提供，独立列表省略时不挂载。
   * @example
   * `<MyCrudList v-bind="bindings.list" />`
   */
  host?: CrudViewEnvironment["host"];
  /** index 的批量控制器；省略不显示，不从 config 创建业务规则。 */
  batch?: BatchController;
  /**
   * 列表查询、列、操作与 DTO 适配的模块配置。
   * @example `<MyCrudList :config="customerConfig" ... />`
   */
  config: CrudListConfig<Row, Id, S, Scope, QueryDTO, C>;
  /**
   * 列表状态与动作控制器；数据、分页、排序均由它受控。
   * @example `<MyCrudList :controller="customerList" ... />`
   */
  controller: CrudListController<Row, Id, S>;
  /**
   * 单元格字段和业务动作所需的页面上下文。
   * @example `<MyCrudList :context="pageContext" ... />`
   */
  context: C;
  /**
   * 新增、详情和编辑页面的导航入口；不传则隐藏对应操作。
   * @example `<MyCrudList :navigation="{ add, detail, edit }" ... />`
   */
  navigation?: CrudNavigation<Id>;
  /**
   * 用户列设置的稳定存储身份。
   * @example `<MyCrudList :preference="{ moduleKey: 'base.customer.list' }" ... />`
   */
  preference: CrudColumnIdentity;
  /**
   * 当前组织/权限等列表范围的稳定标识。
   * @example `<MyCrudList :scope-key="organizationId" ... />`
   */
  scopeKey: string;
}>();
const dictionaries = useFieldDictionaries(
  () => props.config.fields ?? [],
  () => props.context
);
watch(
  () => props.controller.state.loading,
  (loading) => {
    if (loading) void dictionaries.refresh();
  }
);
const slots = defineSlots<CrudListSlots<Row, Id, S>>();
onMounted(() =>
  diagnoseCrudSlots("MyCrudList", slots, [
    "toolbar-left",
    "toolbar-right",
    ...props.config.columns.map((column) => `column-${column.key}`),
    ...Object.keys(props.config.query.schema).map((key) => `query-${key}`),
  ])
);
const preferences = useCrudColumns(props.config.columns, () => props.preference);
const rows = computed(() => cloneReadonlyModel<readonly Row[]>(props.controller.state.rows));
const applied = computed(() => cloneReadonlyModel<AppliedQuery<S>>(props.controller.state.applied));
const draft = computed(() => cloneReadonlyModel<QueryDraft<S>>(props.controller.state.draft));
const sort = computed(() => cloneReadonlyModel<TableSort<Row> | null>(props.controller.state.sort));
const busy = computed(
  () =>
    props.controller.state.loading || !!props.controller.state.busyActionKey || !!props.batch?.busy
);
const toolbarActions = computed(() =>
  (props.config.actions ?? []).filter(
    (action) =>
      action.location === "toolbar" && props.controller.actionAvailability(action.key).visible
  )
);
const rowActions = computed(() =>
  (props.config.actions ?? []).filter((action) => action.location === "row")
);
const selection = computed(() =>
  props.config.selection && props.config.selection !== "none"
    ? {
        mode: props.config.selection,
        keys: cloneReadonlyModel<Id[]>(props.controller.state.selectedKeys),
      }
    : false
);
const navigationError = ref("");
const pageIntent = usePageIntent();
const createTarget = ref<HTMLElement | null>(null);
const intentMessage = computed(() => {
  const intent = pageIntent.intent.value;
  if (!intent) return "";
  const message =
    props.createPermitted === false && intent.action === "create"
      ? "当前账号没有新增该单据的权限，请联系管理员授权，或联系相关人员新增。"
      : pageIntent.guiding.value
        ? `点击新增，开始填写${pageIntent.title.value}。`
        : "已收到操作引导。";
  return [message, pageIntent.error.value].filter(Boolean).join(" ");
});
const intentTone = computed(() => {
  if (pageIntent.error.value) return "error";
  if (props.createPermitted === false && pageIntent.intent.value?.action === "create")
    return "warning";
  return "info";
});
const intentNextStep = computed(() =>
  pageIntent.guiding.value && props.createPermitted !== false ? "点击新增按钮继续。" : undefined
);
function onCreate() {
  if (props.createPermitted === false || busy.value || !props.navigation?.add) return;
  pageIntent.finish();
  void navigate(props.navigation.add);
}
const columnSettingsOpen = ref(false);
async function navigate(action: () => Promise<void>) {
  if (busy.value) return;
  navigationError.value = "";
  try {
    await action();
  } catch (cause) {
    navigationError.value = cause instanceof Error ? cause.message : "导航失败";
  }
}
async function apply(value: AppliedQuery<S>, reason: string) {
  if (reason === "reset") await props.controller.resetQuery();
  else {
    props.controller.setDraft(createQueryDraft(props.config.query.schema, value));
    await props.controller.applyQuery();
  }
}
/** 同步查询编辑草稿；不触发列表请求。 */
function onQueryDraftUpdate(value: QueryDraft<S>) {
  props.controller.setDraft(value);
}
/** 使用当前已应用条件重新加载列表。 */
function onQueryRefresh() {
  return props.controller.refresh();
}
/** 同步列表排序并由 controller 重新取数。 */
function onSortChange(value: TableSort<Row> | null) {
  return props.controller.setSort(value);
}
/** 同步当前行的选择主键。 */
function onSelectionChange(value: { keys: Id[] }) {
  props.controller.select(value.keys);
}
/** 保存用户调整后的列宽偏好。 */
function onColumnResize(value: { key: Extract<keyof Row, string>; width: number }) {
  preferences.update(value.key, { width: value.width });
}
/** 切换列表页码或每页条数。 */
function onPagination(value: { page: number; limit: number }) {
  return props.controller.setPage(value.page, value.limit);
}
function editDisabledReason(rowKey: Id) {
  if (!props.config.editDisabledReason) return;
  const row = props.controller.state.rows.find(
    (item) => props.config.getKey(cloneReadonlyModel<Row>(item)) === rowKey
  );
  return row
    ? props.config.editDisabledReason?.(cloneReadonlyModel<Row>(row), props.context)
    : "记录已变化";
}
const columnSlot = (key: Extract<keyof Row, string>) =>
  `column-${key}` as Exclude<keyof typeof slots, "toolbar-left" | "toolbar-right">;
const querySlots = computed(() =>
  Object.keys(props.config.query.schema)
    .map((key) => `query-${key}` as Exclude<keyof typeof slots, "toolbar-left" | "toolbar-right">)
    .filter((key) => slots[key])
);
const readonlyRow = (row: Readonly<Row>) => readonly(row);
const actionMessage = computed(() => {
  const result = props.controller.actionResult;
  return result
    ? [
        result.message,
        `已完成 ${result.affectedKeys.length} 项`,
        ...(result.failed ?? []).map((item) => `${item.key}：${item.message}`),
      ]
        .filter(Boolean)
        .join("；")
    : "";
});
</script>
<style scoped lang="scss">
.crud-list__create-target {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  flex-shrink: 0;
}
.crud-list__icon-button {
  width: 32px;
  padding: 0;
}

.crud-list__chevron {
  margin-left: 6px;
}

.crud-list__operation-menu {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  max-height: min(500px, 70dvh);
  overflow-y: auto;
}

.crud-list {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  background: var(--content-bg);
}

.crud-list__table {
  flex: 1;
  min-height: 180px;
  overflow: hidden;

  :deep(.my-table) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :deep(.my-table > .page-toolbar:empty) {
    display: none;
  }

  :deep(.my-table > .page-toolbar) {
    margin: 0;
    min-height: 0;
  }
}

.crud-list__commandbar {
  flex: 0 0 auto;
}

.crud-list__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--el-text-color-secondary);
  font-size: 13px;

  :deep(.pagination) {
    flex: 1;
    width: auto;
    padding: 0;
  }
}

@media (max-width: 640px) {
  .crud-list {
    padding: 10px;
  }

  .crud-list__footer {
    justify-content: flex-end;

    :deep(.pagination) {
      flex-basis: 100%;
    }
  }
}
</style>
