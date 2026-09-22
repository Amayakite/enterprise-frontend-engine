<template>
  <section
    ref="root"
    class="my-table"
    :class="[`my-table--${density}`, { 'my-table--single-line': !effectiveWrapCells }]"
    :aria-busy="busy"
  >
    <el-alert v-if="engineError" :title="engineError" type="error" :closable="false" />
    <div
      v-if="(edit && edit.allowAdd) || $slots.title || $slots.toolbar || $slots.tools"
      class="page-toolbar"
    >
      <div class="page-toolbar__left">
        <slot name="title" />
        <el-button v-if="edit && edit.allowAdd" type="primary" :disabled="busy" @click="addRow">
          新增行
        </el-button>
        <slot name="toolbar" />
      </div>
      <div class="page-toolbar__right"><slot name="tools" /></div>
    </div>
    <el-alert v-if="operationError" :title="operationError" type="error" :closable="false" />
    <section
      v-if="draft.errors.value.length"
      class="my-table-errors"
      role="alert"
      aria-label="子表校验错误"
    >
      <strong>发现 {{ draft.errors.value.length }} 项错误</strong>
      <div class="my-table-errors__items">
        <button
          v-for="(error, index) in draft.errors.value"
          :key="`${serializeStableKey(error.rowKey)}-${error.field}-${index}`"
          type="button"
          @click="focusCell(error.rowKey, error.field)"
        >
          {{ errorLabel(error) }}
        </button>
      </div>
    </section>
    <TableView
      v-if="!engineError"
      ref="table"
      :rows="rows"
      :columns="resolvedColumns"
      :get-row-key="getRowKey"
      :height="height"
      :min-height="minHeight"
      :loading="loading"
      :stripe="engineOptions?.stripe"
      :wrap-cells="effectiveWrapCells"
      :current-row-key="draft.session.value?.key"
      current-row-top-align
      :error-row-keys="errorRowKeys"
      :layout-revision="layoutRevision"
      :leading="selection ? { width: 48 } : undefined"
      :trailing="
        edit || $slots.actions
          ? { label: '操作', width: edit && edit.allowRemove ? 180 : 156 }
          : undefined
      "
      @row-click="emit('row-click', $event)"
      @row-dblclick="emit('row-dblclick', $event)"
      @column-resize="emit('column-resize', $event)"
    >
      <template #leading-header>
        <el-checkbox
          v-if="selection && selection.mode === 'multiple'"
          aria-label="选择当前页"
          :model-value="allSelected"
          :indeterminate="someSelected && !allSelected"
          :disabled="busy || !rows.length"
          @change="selectPage"
        />
      </template>
      <template #leading-cell="{ rowKey }">
        <el-checkbox
          aria-label="选择行"
          :model-value="selected(rowKey)"
          :disabled="busy"
          @change="toggleSelection(rowKey)"
        />
      </template>
      <template
        v-for="column in resolvedColumns"
        :key="`header-${column.key}`"
        #[`header-${column.key}`]
      >
        <span class="my-table-header">
          <FieldLabel
            :label="column.label"
            :required="fixedRequired(column.key)"
            :help="headerHelp(column.key)"
          />
          <el-tooltip v-if="column.sortable" :content="sortLabel(column.key)" placement="top">
            <button
              type="button"
              class="my-table-sort"
              :class="{ 'is-active': sort?.key === column.key }"
              :disabled="busy"
              :aria-label="sortLabel(column.key)"
              :aria-pressed="sort?.key === column.key"
              :title="sortLabel(column.key)"
              @click="changeSort(column.key)"
            >
              <el-icon aria-hidden="true"><component :is="sortIcon(column.key)" /></el-icon>
            </button>
          </el-tooltip>
        </span>
      </template>
      <template
        v-for="column in resolvedColumns"
        :key="column.key"
        #[`column-${column.key}`]="{ row, rowKey }"
      >
        <div
          :data-row-key="serializeStableKey(rowKey)"
          :data-field="column.key"
          class="my-table-cell"
          tabindex="-1"
          @keydown="cellKeydown($event, rowKey, column.key)"
        >
          <span
            v-if="dynamicRequired(column.key, displayRow(row, rowKey))"
            class="my-table-required"
            aria-label="本行必填"
          >
            * 本行必填
          </span>
          <template
            v-if="!overlayEdit && draft.session.value?.key === rowKey && editableField(column.key)"
          >
            <slot
              :name="fieldSlotName(column.key)"
              :value="draft.session.value.draft[column.key]"
              :row="draft.session.value.draft"
              :set-value="(value: Row[FieldKey<Row>]) => changeValue(column.key, value)"
            >
              <FieldInput
                :field="editableField(column.key)!"
                :env="environment(draft.session.value.draft)"
                :readonly="busy"
                @change="(value, mapped, reason) => changeValue(column.key, value, mapped, reason)"
              />
            </slot>
            <FieldHelp
              :field="editableField(column.key)!"
              :env="environment(draft.session.value.draft)"
            />
          </template>
          <slot
            v-else
            :name="column.slot ?? `column-${column.key}`"
            :row="displayRow(row, rowKey)"
            :row-key="rowKey"
          >
            <span v-if="column.format">{{ column.format(displayRow(row, rowKey)) }}</span>
            <FieldDisplay
              v-else-if="fieldFor(column.key)"
              :field="fieldFor(column.key)!"
              :env="environment(displayRow(row, rowKey))"
              scene="table"
            />
            <span v-else>{{ displayRow(row, rowKey)[column.key] }}</span>
          </slot>
          <div v-if="cellError(rowKey, column.key)" class="my-table-error" role="alert">
            {{ cellError(rowKey, column.key) }}
          </div>
        </div>
      </template>
      <template #trailing-cell="{ row, rowKey }">
        <div class="my-table-action-cell">
          <div
            v-if="
              edit &&
              (newRowKeys.has(rowKey) ||
                draft.session.value?.key === rowKey ||
                modifiedRowKeys.has(rowKey))
            "
            class="my-table-row-state"
          >
            <el-tag v-if="newRowKeys.has(rowKey)" size="small" type="success">新行</el-tag>
            <el-tag v-if="draft.session.value?.key === rowKey" size="small">编辑中</el-tag>
            <el-tag v-else-if="modifiedRowKeys.has(rowKey)" size="small" type="info">已修改</el-tag>
          </div>
          <div class="my-table-actions">
            <template v-if="edit">
              <template v-if="!overlayEdit && draft.session.value?.key === rowKey">
                <ActionButton label="确认" tone="primary" :disabled="busy" @click="commitEdit" />
                <ActionButton label="取消" :disabled="loading" @click="draft.cancelEdit" />
              </template>
              <ActionButton
                v-else
                :label="overlayEdit && draft.session.value?.key === rowKey ? '继续编辑' : '编辑'"
                tone="primary"
                :disabled="busy"
                @click="startEdit(rowKey)"
              />
            </template>
            <ActionButton
              v-if="edit && edit.allowRemove"
              label="删除"
              tone="danger"
              :disabled="busy"
              @click="removeRow(rowKey)"
            />
            <slot
              name="actions"
              :row="row"
              :row-key="rowKey"
              :editing="draft.session.value?.key === rowKey"
            />
          </div>
        </div>
      </template>
      <template #empty>
        <slot name="empty"><el-empty description="暂无数据" :image-size="64" /></slot>
      </template>
    </TableView>
    <component
      :is="editorShell"
      v-if="edit && overlayEdit"
      :model-value="dialogOpen"
      :title="dialogTitle"
      :width="editorConfig?.width ?? '760px'"
      :loading="loading"
      :confirm-loading="draft.pending.value"
      :confirm-disabled="busy && !draft.pending.value"
      @update:model-value="updateDialogVisible"
      @confirm="commitDialog"
      @cancel="cancelDialog"
    >
      <MyForm
        v-if="draft.session.value"
        ref="rowForm"
        :model-value="draft.session.value.draft"
        :fields="fields ?? []"
        :context="context"
        :create-initial-model="edit.createInitialRow"
        mode="edit"
        :readonly="busy"
        :form-key="serializeStableKey(draft.session.value.key)"
        :columns="editorConfig?.columns ?? 2"
        :density="density"
        @update:model-value="updateDialogModel"
      >
        <template
          v-for="field in (fields ?? []).filter((item) => slots[fieldSlotName(item.key)])"
          :key="`dialog-${field.key}`"
          #[`field-${field.key}`]="cell"
        >
          <slot
            :name="fieldSlotName(field.key)"
            :value="cell.value"
            :row="draft.session.value.draft"
            :set-value="cell.setValue"
          />
        </template>
      </MyForm>
    </component>
    <slot v-if="loading" name="loading" />
    <div v-if="summary" class="my-table-summary">
      <span>{{ summary.scope === "page" ? "当前页合计" : "全部合计" }}</span>
      <slot name="summary" :scope="summary.scope">{{ summary.text }}</slot>
    </div>
    <div
      v-if="pagination"
      :key="paginationRevision"
      :class="{ 'my-table-pagination--busy': busy }"
      :inert="busy || undefined"
    >
      <Pagination
        :page="pagination.pageNum"
        :limit="pagination.pageSize"
        :total="pagination.total"
        @pagination="queuePage"
      />
    </div>
  </section>
</template>

<script setup lang="ts" generic="Row extends object, Key extends string | number, C = undefined">
import TableView from "./TableView.vue";
import { Sort, SortDown, SortUp } from "@element-plus/icons-vue";
import { focusFieldControl } from "@/utils/dom";
import MyDialog from "@/components/common/MyDialog.vue";
import MyDrawer from "@/components/common/MyDrawer.vue";
import MyForm from "@/components/business/MyForm/index.vue";
import ActionButton from "@/components/business/ActionButton.vue";
import Pagination from "@/components/common/Pagination.vue";
import FieldInput from "@/components/business/fields/FieldInput.vue";
import FieldDisplay from "@/components/business/fields/FieldDisplay.vue";
import FieldHelp from "@/components/business/fields/FieldHelp.vue";
import FieldLabel from "@/components/business/fields/FieldLabel.vue";
import { fieldHelpText } from "@/components/business/fields/presentation";
import { normalizeFields } from "@/components/business/fields/normalize";
import { sameModelValue } from "@/components/business/fields/model";
import { serializeStableKey } from "@/utils/identity";
import { useRowDraft } from "./useRowDraft";
import {
  referenceDisplayKey,
  createReferenceDisplayContext,
} from "@/components/business/fields/reference-display";
import { toTableColumns } from "./columns";
import type {
  TableColumn,
  TablePagination,
  TableSort,
  TableSelection,
  TableEdit,
  TableValidation,
  MyTableExpose,
  MyTableEmits,
  TableEngineOptions,
} from "./types";
import type {
  FieldDefinition,
  FieldEnvironment,
  FieldKey,
  ChangeReason,
  FieldDensity,
  MyFormExpose,
} from "@/components/business/fields/types";

const props = withDefaults(
  defineProps<{
    /** 受控表格数据；行增删与编辑结果由宿主合并回此数组。 */
    rows: readonly Row[];
    /** 从行数据取得稳定主键，供选择、编辑和定位使用。 */
    getRowKey: (row: Readonly<Row>) => Key;
    /** 展示列配置；不传时可由 fields 推导。 */
    columns?: readonly TableColumn<Row>[];
    /** 字段合同，用于行编辑、展示格式和校验。 */
    fields?: readonly FieldDefinition<Row, C>[];
    /** 字段渲染和联动所需的页面上下文。 */
    context: C;
    /** 表格视口高度，默认 360。 */
    height?: number | string;
    /** 表格允许收缩到的最小高度。 */
    minHeight?: number | string;
    /** 宿主正在加载数据时显示读取状态。 */
    loading?: boolean;
    /** 冻结编辑/选择等命令，不显示读取中的遮罩。 */
    readonly?: boolean;
    /** 分页状态；传 false（默认）则不显示内置分页器。 */
    pagination?: TablePagination | false;
    /** 当前受控排序；null（默认）表示不排序。 */
    sort?: TableSort<Row> | null;
    /** 当前受控选择状态；传 false（默认）关闭选择。 */
    selection?: TableSelection<Key> | false;
    /** 行编辑配置；传 false（默认）关闭编辑能力。 */
    edit?: TableEdit<Row, C> | false;
    /** 汇总显示范围及自定义说明。 */
    summary?: { scope: "page" | "all"; text?: string };
    /** 表格引擎的非业务展示选项。 */
    engineOptions?: TableEngineOptions;
    /** 表格密度，默认 compact。 */
    density?: FieldDensity;
    /** 展示装配可明确要求单行；省略保持既有编辑/参照换行规则。 */
    wrapCells?: boolean | null;
    /** 用于编辑草稿等局部状态隔离的稳定模块标识。 */
    moduleKey?: string;
    /** 为跨页错误摘要提供全量行序号或业务名称。 */
    getRowLabel?: (key: Key) => string | undefined;
    /** 定位跨页/页签数据前由宿主完成装载；组件随后滚动并聚焦。 */
    beforeLocate?: (key: Key, field: FieldKey<Row>) => Promise<void>;
  }>(),
  {
    height: 360,
    loading: false,
    pagination: false,
    sort: null,
    selection: false,
    edit: false,
    density: "compact",
    wrapCells: null,
  }
);
const emit = defineEmits<MyTableEmits<Row, Key>>();
const slots = defineSlots<
  {
    [K in FieldKey<Row> as `field-${K}`]?: (props: {
      value: Row[K];
      row: Readonly<Row>;
      setValue: (value: Row[K]) => void;
    }) => unknown;
  } & {
    [name: `column-${string}`]: (props: { row: Readonly<Row>; rowKey: Key }) => unknown;
  } & {
    title?: () => unknown;
    toolbar?: () => unknown;
    tools?: () => unknown;
    actions?: (props: { row: Readonly<Row>; rowKey: Key; editing: boolean }) => unknown;
    empty?: () => unknown;
    loading?: () => unknown;
    summary?: (props: { scope: "page" | "all" }) => unknown;
  }
>();
function fieldSlotName(key: FieldKey<Row>) {
  return `field-${key}` as keyof typeof slots & `field-${string}`;
}
const engineError = computed(() => {
  const unsupported = Object.keys(props.engineOptions ?? {}).filter((key) => key !== "stripe");
  return unsupported.length
    ? `不支持的 engineOptions：${unsupported.join("、")}。首期不支持虚拟滚动、合并和展开组合。`
    : "";
});
const root = ref<HTMLElement>();
const displayContext = createReferenceDisplayContext();
provide(referenceDisplayKey, displayContext);
watch(
  () => props.context,
  () => displayContext.reset(),
  { deep: true, flush: "sync" }
);
onBeforeUnmount(() => displayContext.dispose());
const table = ref<{
  recalculate: () => Promise<void>;
  scrollToCell: (key: Key, field: FieldKey<Row>) => Promise<void>;
}>();
const rowForm = ref<MyFormExpose<Row>>();
const dialogOpen = ref(false);
const newRowKeys = shallowRef(new Set<Key>());
const modifiedRowKeys = shallowRef(new Set<Key>());
const operationError = ref("");
const draft = useRowDraft(
  props,
  (rowKey, changes) => {
    modifiedRowKeys.value.add(rowKey);
    emit("row-patch", { rowKey, changes });
  },
  (key, committed) => {
    dialogOpen.value = false;
    if (!newRowKeys.value.delete(key)) return;
    if (!committed) emit("row-remove", key);
  }
);
const overlayEdit = computed(
  () => !!props.edit && ["dialog", "drawer"].includes(props.edit.presentation ?? "inline")
);
const drawerEdit = computed(() => !!props.edit && props.edit.presentation === "drawer");
const editorShell = computed(() => (drawerEdit.value ? MyDrawer : MyDialog));
const editorConfig = computed(() => {
  if (!props.edit) return;
  return drawerEdit.value ? props.edit.drawer : props.edit.dialog;
});
const effectiveWrapCells = computed(
  () =>
    props.wrapCells ??
    (!!props.edit ||
      !!props.fields?.some((field) => field.type === "textarea" || field.type === "reference"))
);
const dialogTitle = computed(() => {
  if (!props.edit || !draft.session.value) return "编辑明细";
  const title = editorConfig.value?.title;
  return typeof title === "function" ? title(draft.session.value.draft) : (title ?? "编辑明细");
});
const layoutRevision = ref(0);
watch(
  [draft.session, draft.errors, () => props.density, effectiveWrapCells],
  () => layoutRevision.value++,
  { deep: true, flush: "post" }
);
const errorRowKeys = computed(() => [...new Set(draft.errors.value.map((error) => error.rowKey))]);
watch(
  () => !!draft.session.value,
  (active) => emit("draft-change", active)
);
const navigating = ref(false);
const busy = computed(
  () => props.loading || props.readonly || draft.pending.value || navigating.value
);
watch(busy, (value, previous) => {
  const first = draft.errors.value[0];
  if (previous && !value && first && draft.session.value?.key === first.rowKey)
    void focusCell(first.rowKey, first.field);
});
const resolvedColumns = computed(() => props.columns ?? toTableColumns(props.fields ?? []));
const displayRow = (row: Readonly<Row>, key: Key) =>
  draft.session.value?.key === key ? draft.session.value.draft : row;
const environment = (model: Readonly<Row>): FieldEnvironment<Row, C> => ({
  model,
  context: props.context,
  mode: "edit",
});
const fieldFor = (key: FieldKey<Row>) => props.fields?.find((field) => field.key === key);
function fixedRequired(key: FieldKey<Row>) {
  if (!props.edit) return false;
  const form = fieldFor(key)?.form;
  return (
    !!form &&
    (form.modes ?? ["add", "edit"]).includes("edit") &&
    (form.visible === undefined || form.visible === true) &&
    form.required === true
  );
}
function headerHelp(key: FieldKey<Row>) {
  const field = fieldFor(key);
  return field ? fieldHelpText(field) : "";
}
function dynamicRequired(key: FieldKey<Row>, row: Readonly<Row>) {
  if (!props.edit) return false;
  const field = fieldFor(key);
  if (!field?.form || fixedRequired(key)) return false;
  const form = normalizeFields([field], environment(row))[0]?.form;
  return form?.visible && form.required;
}
function editableField(key: FieldKey<Row>) {
  const row = draft.session.value?.draft;
  if (!row) return;
  return normalizeFields(props.fields ?? [], environment(row)).find(
    (entry) => entry.field.key === key && entry.form?.visible && !entry.form.readonly
  )?.field;
}
function changeValue(
  key: FieldKey<Row>,
  value: Row[FieldKey<Row>],
  mapped: Partial<Row> = {},
  reason: ChangeReason = "user"
) {
  if (busy.value || !editableField(key)) return;
  if (Object.hasOwn(mapped, key) && !sameModelValue(mapped[key], value))
    throw new Error(`参照回填冲突：${key}`);
  draft.patch({ ...mapped, [key]: value } as Partial<Row>, reason);
}
const cellError = (key: Key, field: FieldKey<Row>) =>
  draft.errors.value.find((error) => error.rowKey === key && error.field === field)?.message;
function errorLabel(error: TableValidation<Row, Key>["errors"][number]) {
  const rowIndex = props.rows.findIndex((row) => props.getRowKey(row) === error.rowKey);
  const field = fieldFor(error.field);
  const rowLabel =
    props.getRowLabel?.(error.rowKey) ?? (rowIndex >= 0 ? `第 ${rowIndex + 1} 行` : "");
  return `${rowLabel ? `${rowLabel} · ` : ""}${field?.label ?? error.field}：${error.message}`;
}
async function locateTableCell(key: Key, field: FieldKey<Row>) {
  await table.value?.recalculate();
  await nextTick();
  await table.value?.scrollToCell(key, field);
  await nextTick();
  const cell = Array.from(
    root.value?.querySelectorAll<HTMLElement>("[data-row-key][data-field]") ?? []
  ).find((cell) => cell.dataset.rowKey === serializeStableKey(key) && cell.dataset.field === field);
  cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  focusFieldControl(cell);
}
async function focusCell(key: Key, field: FieldKey<Row>) {
  await props.beforeLocate?.(key, field);
  await nextTick();
  if (props.edit && !props.readonly) {
    await startEdit(key, field, true);
    return;
  }
  await locateTableCell(key, field);
}
async function commitEdit() {
  const success = await draft.commitEdit();
  const first = draft.errors.value[0];
  if (!success && first) await focusCell(first.rowKey, first.field);
  return success;
}
async function startEdit(key: Key, field?: FieldKey<Row>, located = false) {
  if (busy.value) return false;
  if (!located) {
    const locateField = field ?? resolvedColumns.value[0]?.key;
    if (locateField) await props.beforeLocate?.(key, locateField);
    await nextTick();
  }
  if (draft.session.value?.key !== key) {
    if (!(await commitEdit())) return false;
    const previousErrors = [...draft.errors.value];
    if (!draft.begin(key)) return false;
    draft.errors.value = previousErrors;
  }
  const target = field ?? resolvedColumns.value.find((column) => editableField(column.key))?.key;
  if (overlayEdit.value) {
    dialogOpen.value = true;
    await nextTick();
    if (draft.errors.value.some((error) => error.rowKey === key)) await rowForm.value?.validate();
    if (target) rowForm.value?.focusField(target);
  } else if (target) await locateTableCell(key, target);
  return true;
}
function updateDialogModel(model: Row) {
  const current = draft.session.value;
  if (!current) return;
  const changes: Partial<Row> = {};
  for (const key of Object.keys(model) as FieldKey<Row>[])
    if (!sameModelValue(current.draft[key], model[key])) changes[key] = model[key];
  if (Object.keys(changes).length) draft.patch(changes);
}
function cancelDialog() {
  dialogOpen.value = false;
  draft.cancelEdit();
}
function updateDialogVisible(value: boolean) {
  dialogOpen.value = value;
  if (!value && draft.session.value) draft.cancelEdit();
}
async function commitDialog() {
  const formResult = await rowForm.value?.validate();
  if (formResult && !formResult.valid) {
    await draft.validate(draft.session.value ? [draft.session.value.draft] : []);
    const first = formResult.errors[0];
    if (first) rowForm.value?.focusField(first.field);
    return false;
  }
  const success = await commitEdit();
  if (success) dialogOpen.value = false;
  return success;
}
async function addRow() {
  if (busy.value || !props.edit || !props.edit.allowAdd || !(await commitEdit())) return false;
  operationError.value = "";
  const row = props.edit.createInitialRow();
  const key = props.getRowKey(row);
  serializeStableKey(key);
  if (props.rows.some((item) => props.getRowKey(item) === key)) {
    operationError.value = "新增行的稳定行键已存在";
    return false;
  }
  newRowKeys.value.add(key);
  emit("row-add", row);
  await nextTick();
  if (await startEdit(key)) return true;
  newRowKeys.value.delete(key);
  emit("row-remove", key);
  operationError.value = "新增行未能进入编辑，请检查 row-add 是否同步更新 rows";
  return false;
}
async function removeRow(key: Key) {
  if (
    busy.value ||
    !props.edit ||
    !props.edit.allowRemove ||
    !props.rows.some((row) => props.getRowKey(row) === key)
  )
    return false;
  if (draft.session.value?.key === key) {
    const wasNew = newRowKeys.value.has(key);
    draft.cancelEdit();
    if (wasNew) return true;
  } else if (!(await commitEdit())) return false;
  modifiedRowKeys.value.delete(key);
  draft.errors.value = draft.errors.value.filter((error) => error.rowKey !== key);
  emit("row-remove", key);
  return true;
}
async function cellKeydown(event: KeyboardEvent, key: Key, field: FieldKey<Row>) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    draft.session.value?.key !== key ||
    !["Enter", "Tab"].includes(event.key)
  )
    return;
  const target = event.target;
  if (
    !(target instanceof HTMLElement) ||
    target.closest("textarea,[contenteditable=true],.my-reference")
  )
    return;
  const columns = resolvedColumns.value.filter((column) => editableField(column.key));
  const next =
    columns[columns.findIndex((column) => column.key === field) + (event.shiftKey ? -1 : 1)];
  if (event.key === "Tab" && !next) return;
  event.preventDefault();
  if ((await commitEdit()) && next) await startEdit(key, next.key);
}
const selected = (key: Key) => !!props.selection && props.selection.keys.includes(key);
const allSelected = computed(
  () => !!props.rows.length && props.rows.every((row) => selected(props.getRowKey(row)))
);
const someSelected = computed(() => props.rows.some((row) => selected(props.getRowKey(row))));
function publishSelection(keys: Key[]) {
  emit("selection-change", {
    keys,
    currentPageRows: props.rows.filter((row) => keys.includes(props.getRowKey(row))),
  });
}
function toggleSelection(key: Key) {
  if (!props.selection || busy.value) return;
  publishSelection(
    selected(key)
      ? props.selection.keys.filter((item) => item !== key)
      : props.selection.mode === "single"
        ? [key]
        : [...props.selection.keys, key]
  );
}
function selectPage() {
  if (!props.selection || busy.value) return;
  const pageKeys = props.rows.map(props.getRowKey);
  publishSelection(
    allSelected.value
      ? props.selection.keys.filter((key) => !pageKeys.includes(key))
      : [...new Set([...props.selection.keys, ...pageKeys])]
  );
}
function clearPageSelection() {
  if (props.selection && !props.selection.preserveOnPageChange && props.selection.keys.length)
    publishSelection([]);
}
async function changeSort(key: FieldKey<Row>) {
  if (busy.value) return;
  navigating.value = true;
  try {
    if (!(await commitEdit())) return;
    const next: TableSort<Row> | null =
      props.sort?.key !== key
        ? { key, order: "asc" }
        : props.sort.order === "asc"
          ? { key, order: "desc" }
          : null;
    clearPageSelection();
    emit("sort-change", next);
  } finally {
    navigating.value = false;
  }
}
function sortIcon(key: FieldKey<Row>) {
  if (props.sort?.key !== key) return Sort;
  return props.sort.order === "asc" ? SortUp : SortDown;
}
function sortLabel(key: FieldKey<Row>) {
  const column = resolvedColumns.value.find((item) => item.key === key);
  const label = column?.label ?? String(key);
  if (props.sort?.key !== key) return `排序${label}，当前未排序，点击升序`;
  return props.sort.order === "asc"
    ? `排序${label}，当前升序，点击降序`
    : `排序${label}，当前降序，点击取消排序`;
}
const paginationRevision = ref(0);
let queuedPage: { page: number; limit: number } | undefined;
function queuePage(value: { page: number; limit: number }) {
  const scheduled = !!queuedPage;
  queuedPage = value;
  if (!scheduled)
    queueMicrotask(async () => {
      const next = queuedPage;
      queuedPage = undefined;
      if (!next || !props.pagination || busy.value) {
        paginationRevision.value++;
        return;
      }
      navigating.value = true;
      try {
        if (!(await commitEdit())) return;
        const pageNum = next.limit !== props.pagination.pageSize ? 1 : next.page;
        if (pageNum !== props.pagination.pageNum || next.limit !== props.pagination.pageSize) {
          clearPageSelection();
          emit("page-change", { pageNum, pageSize: next.limit });
        }
      } finally {
        navigating.value = false;
        paginationRevision.value++;
      }
    });
}
watch(
  [
    () => props.pagination && props.pagination.pageNum,
    () => props.pagination && props.pagination.pageSize,
    () => props.sort?.key,
    () => props.sort?.order,
  ],
  () => {
    draft.cancelEdit();
    displayContext.reset();
    clearPageSelection();
  }
);
defineExpose<MyTableExpose<Row, Key>>({
  snapshotDraft(fields) {
    const snapshot = draft.snapshotDraft(fields);
    return snapshot ? { ...snapshot, isNew: newRowKeys.value.has(snapshot.rowKey) } : null;
  },
  async restoreDraft(snapshot, fields) {
    if (busy.value || !props.edit) return false;
    const locateField = resolvedColumns.value[0]?.key ?? fields[0];
    if (locateField) await props.beforeLocate?.(snapshot.rowKey, locateField);
    await nextTick();
    if (!draft.restoreDraft(snapshot, fields)) return false;
    if (snapshot.isNew) newRowKeys.value.add(snapshot.rowKey);
    if (overlayEdit.value) dialogOpen.value = true;
    return true;
  },
  subscribeDraft: draft.subscribeDraft,
  startEdit,
  commitEdit,
  cancelEdit: draft.cancelEdit,
  validate: async (rows) => {
    const result = await draft.validate(rows);
    return {
      ...result,
      errors: result.errors.map((error) => ({ ...error, moduleKey: props.moduleKey })),
    };
  },
  focusCell,
  addRow,
  removeRow,
});
</script>

<style scoped lang="scss">
.my-table {
  min-width: 0;
}
.my-table-errors {
  padding: 10px 12px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: var(--el-border-radius-base);
}
.my-table-errors__items {
  display: flex;
  gap: 4px 12px;
  flex-wrap: wrap;
  margin-top: 6px;
  button {
    padding: 0;
    color: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 2px;
    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
    }
  }
}
.my-table-cell {
  padding: 4px 0;
  min-height: 24px;
  :deep(.el-input-number) {
    width: 100%;
  }
}
.my-table--comfortable .my-table-cell {
  padding: 10px 0;
}
.my-table-header,
.my-table-actions,
.my-table-row-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.my-table-row-state {
  min-height: 24px;
}
.my-table-action-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.my-table-actions :deep(.el-button) {
  margin: 0;
}
.my-table-actions :deep(.el-tooltip__trigger) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.my-table-required {
  display: block;
  color: var(--el-color-danger);
  font-size: 12px;
}
.my-table :deep(.vxe-body--column .vxe-cell) {
  height: auto;
  max-height: none;
}
.my-table-cell {
  overflow-wrap: anywhere;
  white-space: normal;
}
.my-table--single-line .my-table-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.my-table-error {
  color: var(--el-color-danger);
  font-size: 12px;
  white-space: normal;
}
.my-table-sort {
  display: inline-flex;
  width: 24px;
  height: 24px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--el-border-radius-small);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  &:hover,
  &.is-active {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 1px;
  }
  &:disabled {
    color: var(--el-text-color-disabled);
    cursor: not-allowed;
    background: transparent;
  }
}
.my-table-summary {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: var(--el-fill-color-light);
}
.my-table-pagination--busy {
  opacity: 0.6;
}
</style>
