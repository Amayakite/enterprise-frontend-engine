<template>
  <section class="crud-list">
    <!-- 显示筛选条件。用户点击查询后才应用条件并加载列表；页面无需再监听输入变化重复请求。 -->
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
                :disabled-reason="action.availability.reason"
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
      <template v-if="controller.presets" #filter-extra="{ close }">
        <QueryPresets :controller="controller.presets" :disabled="busy" @navigate="close" />
      </template>
      <template v-for="key in querySlots" :key="key" #[key]>
        <slot :name="key" :draft="controller.state.draft" :set-draft="controller.setDraft" />
      </template>
    </QueryPanel>
    <MyFeedback v-if="controller.presets?.error" :message="controller.presets.error" tone="warning">
      <el-button link @click="controller.presets.reload">重试读取方案</el-button>
    </MyFeedback>
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
        :wrap-cells="false"
        height="100%"
        :sort="sort"
        :selection="selection"
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
          #actions="{ row, rowKey }"
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
            :disabled-reason="editDisabledReason(row)"
            @click="navigate(() => navigation!.edit!(rowKey))"
          />
          <el-dropdown
            v-if="rowActionViews.get(rowKey)?.some((action) => action.availability.visible)"
            :disabled="busy"
            trigger="click"
            @command="controller.runAction($event, rowKey)"
          >
            <el-button link type="primary" :disabled="busy">更多</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <template v-for="action in rowActionViews.get(rowKey)" :key="action.key">
                  <el-dropdown-item
                    v-if="action.availability.visible"
                    :command="action.key"
                    :disabled="!!action.availability.reason"
                  >
                    <span :title="action.availability.reason">
                      {{ action.label
                      }}{{ action.availability.reason ? `（${action.availability.reason}）` : "" }}
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
import QueryPresets from "@/components/business/search/QueryPresets.vue";
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
const props = withDefaults(
  defineProps<{
    /** 标准CRUD 组件和 useCrud 方法的新增权限；默认 true 保持独立列表原行为，false 隐藏并禁用新增。 */
    createPermitted?: boolean;
    /** 导航意图视觉效果；默认 halo，false 仅文字说明。 */
    guideMode?: "halo" | "spotlight" | false;
    /**
     * 当前列表自动消费的弹窗/抽屉容器；标准 useCrudView 会提供，独立列表省略时不挂载。
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
  }>(),
  { createPermitted: true }
);
/** 读取列表字段所需字典，供单元格显示名称，列表刷新时也能更新字典。 */
const dictionaries = useFieldDictionaries(
  () => props.config.fields ?? [],
  () => props.context
);
/** 每轮列表加载开始时刷新字典，避免后台字典修改后列表一直显示旧名称。 */
watch(
  () => props.controller.state.loading,
  (loading) => {
    if (loading) void dictionaries.refresh();
  }
);
const slots = defineSlots<CrudListSlots<Row, Id, S>>();
/** 检查工具栏、查询和列插槽是否写错名称，帮助定位没有显示的自定义内容。 */
onMounted(() =>
  diagnoseCrudSlots("MyCrudList", slots, [
    "toolbar-left",
    "toolbar-right",
    ...props.config.columns.map((column) => `column-${column.key}`),
    ...Object.keys(props.config.query.schema).map((key) => `query-${key}`),
  ])
);
/** 管理当前用户的列宽、显隐、固定位置等偏好，并转换为表格需要的列配置。 */
const preferences = useCrudColumns(props.config.columns, () => props.preference);
/** 当前页数据的只读副本，供表格和业务插槽显示。 */
const rows = computed(() => cloneReadonlyModel<readonly Row[]>(props.controller.state.rows));
/** 已经应用的查询条件，和用户还没点查询的输入草稿区分开。 */
const applied = computed(() => cloneReadonlyModel<AppliedQuery<S>>(props.controller.state.applied));
/** 尚未应用的筛选输入，供查询面板编辑，输入时不直接发请求。 */
const draft = computed(() => cloneReadonlyModel<QueryDraft<S>>(props.controller.state.draft));
/** 当前已应用的排序信息，用于显示表头排序状态。 */
const sort = computed(() => cloneReadonlyModel<TableSort<Row> | null>(props.controller.state.sort));
/** 合并列表加载、单项操作和批量操作状态，避免用户同时发起冲突操作。 */
const busy = computed(
  () =>
    props.controller.state.loading || !!props.controller.state.busyActionKey || !!props.batch?.busy
);
/** 挑出工具栏动作，计算权限及可用性，并去掉不可见按钮。 */
const toolbarActions = computed(() =>
  (props.config.actions ?? [])
    .filter((action) => action.location === "toolbar")
    .map((action) => ({ ...action, availability: props.controller.actionAvailability(action.key) }))
    .filter((action) => action.availability.visible)
);
/** 只保留行操作配置，后续按每一行的数据分别判断是否可用。 */
const rowActions = computed(() =>
  (props.config.actions ?? []).filter((action) => action.location === "row")
);
/** 按行 ID 缓存本轮各按钮的权限和禁用原因，模板无需重复计算同一行。 */
const rowActionViews = computed(
  () =>
    new Map(
      rows.value.map((row) => {
        const key = props.config.getKey(row);
        return [
          key,
          rowActions.value.map((action) => ({
            ...action,
            availability: props.controller.actionAvailability(action.key, key),
          })),
        ];
      })
    )
);
/** 把选择方式和选中 ID 交给表格；配置 none 时不显示选择功能。 */
const selection = computed(() =>
  props.config.selection && props.config.selection !== "none"
    ? {
        mode: props.config.selection,
        keys: cloneReadonlyModel<Id[]>(props.controller.state.selectedKeys),
      }
    : false
);
/** 新增、编辑或详情跳转失败时的局部提示，不混入列表查询错误。 */
const navigationError = ref("");
/** 读取其他页面带来的新增引导，提供提示文案和结束引导的方法。 */
const pageIntent = usePageIntent();
/** 新增按钮所在元素，供操作引导定位和高亮。 */
const createTarget = ref<HTMLElement | null>(null);
/** 根据新增权限、引导进度和跳转错误生成当前提示文案。 */
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
/** 跳转错误用错误色，无新增权限用警告色，普通引导用信息色。 */
const intentTone = computed(() => {
  if (pageIntent.error.value) return "error";
  if (props.createPermitted === false && pageIntent.intent.value?.action === "create")
    return "warning";
  return "info";
});
/** 只有仍需引导且具备新增权限时，才提示点击新增按钮。 */
const intentNextStep = computed(() =>
  pageIntent.guiding.value && props.createPermitted !== false ? "点击新增按钮继续。" : undefined
);
/** 再次检查新增权限和忙碌状态，结束引导后打开新增入口。 */
function onCreate() {
  if (props.createPermitted === false || busy.value || !props.navigation?.add) return;
  pageIntent.finish();
  void navigate(props.navigation.add);
}
/** 控制列设置窗口的打开状态，不改变已经应用的列偏好。 */
const columnSettingsOpen = ref(false);
/** 执行页面跳转并在列表内显示失败原因，操作忙碌时不重复跳转。 */
async function navigate(action: () => Promise<void>) {
  if (busy.value) return;
  navigationError.value = "";
  try {
    await action();
  } catch (cause) {
    navigationError.value = cause instanceof Error ? cause.message : "导航失败";
  }
}
/** 将查询面板确认的条件交给列表重新查询；reset 则恢复模块默认条件。 */
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
/** 用当前行的只读数据执行模块编辑限制，例如已审核记录不允许修改。 */
function editDisabledReason(row: Readonly<Row>) {
  return props.config.editDisabledReason?.(cloneReadonlyModel<Row>(row), props.context);
}

/** 把字段名转为 column-* 插槽名，将自定义单元格传给表格。 */
const columnSlot = (key: Extract<keyof Row, string>) =>
  `column-${key}` as Exclude<keyof typeof slots, "toolbar-left" | "toolbar-right">;
/** 只透传页面实际提供的 query-* 插槽，未提供的查询字段继续使用默认输入。 */
const querySlots = computed(() =>
  Object.keys(props.config.query.schema)
    .map((key) => `query-${key}` as Exclude<keyof typeof slots, "toolbar-left" | "toolbar-right">)
    .filter((key) => slots[key])
);
/** 为行操作插槽提供只读数据，业务按钮不能绕过保存流程直接修改列表记录。 */
const readonlyRow = (row: Readonly<Row>) => readonly(row);
/** 把操作结果、成功数量和逐项失败原因组合为一条可读反馈。 */
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
  gap: var(--ui-section-gap);
  max-height: min(500px, 70dvh);
  overflow-y: auto;
}

.crud-list {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--ui-panel-padding);
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
