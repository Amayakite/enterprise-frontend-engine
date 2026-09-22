<template>
  <MyTable
    ref="table"
    :rows="pageRows"
    :get-row-key="getRowKey"
    :fields="fields"
    :context="context"
    :readonly="binding.busy"
    :edit="
      binding.readonly && !binding.busy
        ? false
        : {
            createInitialRow,
            allowAdd: !binding.readonly,
            allowRemove: !binding.readonly,
            presentation: editPresentation,
            dialog: editDialog,
            drawer: editDrawer,
          }
    "
    :pagination="paginated ? { pageNum, pageSize, total: rows.length } : false"
    :height="height"
    :min-height="minHeight"
    :wrap-cells="true"
    :before-locate="beforeLocate"
    :get-row-label="rowLabel"
    @page-change="
      pageNum = $event.pageNum;
      pageSize = $event.pageSize;
    "
    @row-add="add"
    @row-remove="remove"
    @row-patch="patch"
    @draft-change="hasDraft = $event"
  >
    <template
      v-for="field in fields.filter((item) => slots[fieldSlot(item.key)])"
      :key="`field-${field.key}`"
      #[`field-${field.key}`]="cell"
    >
      <slot
        :name="fieldSlot(field.key)"
        :value="cell.value"
        :row="cell.row"
        :set-value="cell.setValue"
      />
    </template>
    <template
      v-for="field in fields.filter((item) => slots[columnSlot(item.key)])"
      :key="`column-${field.key}`"
      #[`column-${field.key}`]="cell"
    >
      <slot :name="columnSlot(field.key)" :row="cell.row" :row-key="cell.rowKey" />
    </template>
    <template v-if="$slots.empty" #empty><slot name="empty" /></template>
  </MyTable>
</template>
<script setup lang="ts" generic="Row extends object, Key extends string | number, C">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import MyTable from "@/components/table/MyTable.vue";
import { cloneModel, cloneReadonlyModel } from "@/components/business/fields/model";
import { normalizeFields } from "@/components/business/fields/normalize";
import type { FieldDefinition, FieldKey } from "@/components/business/fields/types";
import type { MyTableExpose, TableDraftSnapshot, TableEdit } from "@/components/table/types";
import type { CrudChildTableChange, CrudTableBinding } from "./types";
const props = withDefaults(
  defineProps<{
    /**
     * 子表受控数据绑定；子表变更通过 binding 回写父表模型。
     * @example `<MyCrudChildTable :binding="contactsBinding" ... />`
     */
    binding: CrudTableBinding<Row>;
    /**
     * 子表字段定义。
     * @example `<MyCrudChildTable :fields="contactConfig.fields" ... />`
     */
    fields: readonly FieldDefinition<Row, C>[];
    /**
     * 子表字段渲染和联动所需的上下文。
     * @example `<MyCrudChildTable :context="pageContext" ... />`
     */
    context: C;
    /**
     * 从子表行取得稳定主键。
     * @example `<MyCrudChildTable :get-row-key="(row) => row.id" ... />`
     */
    getRowKey: (row: Readonly<Row>) => Key;
    /**
     * 返回新增子表行的完整初始值。
     * @example `<MyCrudChildTable :create-initial-row="createContact" ... />`
     */
    createInitialRow: () => Row;
    /**
     * 激活包含此子表的分区后调用，用于延迟挂载场景。
     * @example `<MyCrudChildTable :activate="loadContacts" ... />`
     */
    activate?: () => Promise<void>;
    /**
     * 子表视口高度，默认 auto。
     * @example `<MyCrudChildTable height="320" ... />`
     */
    height?: string | number;
    /** 子表允许收缩到的最小高度，默认 164。 */
    minHeight?: string | number;
    /**
     * 本地前端分页的每页条数，默认 10。
     * @example `<MyCrudChildTable :page-size="20" ... />`
     */
    pageSize?: number;
    /**
     * 子表编辑界面的呈现方式，默认 inline。
     * @example `<MyCrudChildTable edit-presentation="drawer" ... />`
     */
    editPresentation?: "inline" | "dialog" | "drawer";
    /** dialog 编辑方式的标题、宽度和列数配置。 */
    editDialog?: TableEdit<Row, C>["dialog"];
    /** drawer 编辑方式的标题、宽度和列数配置。 */
    editDrawer?: TableEdit<Row, C>["drawer"];
    /** 每次子表变更后的统一规范化入口。 */
    normalizeRows?: (rows: readonly Row[], change: CrudChildTableChange<Row, Key>) => Row[];
  }>(),
  { height: "auto", minHeight: 164, pageSize: 10, editPresentation: "inline" }
);
const slots = defineSlots<
  {
    [K in FieldKey<Row> as `field-${K}`]?: (props: {
      value: Row[K];
      row: Readonly<Row>;
      setValue: (value: Row[K]) => void;
    }) => unknown;
  } & {
    [K in FieldKey<Row> as `column-${K}`]?: (props: { row: Readonly<Row>; rowKey: Key }) => unknown;
  } & { empty?: () => unknown }
>();
const table = ref<MyTableExpose<Row, Key>>();
const draftListeners = new Set<() => void>();
const notifyDraft = () => draftListeners.forEach((listener) => listener());
let unsubscribeTableDraft: (() => void) | undefined;
watch(table, (value) => {
  unsubscribeTableDraft?.();
  unsubscribeTableDraft = value?.subscribeDraft(notifyDraft);
});
watch(() => props.binding.rows, notifyDraft);
const hasDraft = ref(false);
const pageNum = ref(1),
  pageSize = ref(props.pageSize);
const sourceRows = computed(() => props.binding.rows);
const rows = computed(() => cloneReadonlyModel<Row[]>(sourceRows.value));
const paginated = computed(() => rows.value.length > props.pageSize);
const pageRows = computed(() =>
  paginated.value
    ? rows.value.slice((pageNum.value - 1) * pageSize.value, pageNum.value * pageSize.value)
    : rows.value
);
watch(
  () => rows.value.length,
  () => {
    pageNum.value = Math.min(
      pageNum.value,
      Math.max(1, Math.ceil(rows.value.length / pageSize.value))
    );
  }
);
function add(row: Row) {
  replace([...rows.value, row], { type: "add", key: props.getRowKey(row) });
  pageNum.value = Math.max(1, Math.ceil(rows.value.length / pageSize.value));
}
function remove(key: Key) {
  replace(
    rows.value.filter((row) => props.getRowKey(row) !== key),
    { type: "remove", key }
  );
}
function patch(value: { rowKey: Key; changes: Partial<Row> }) {
  replace(
    rows.value.map((row) =>
      props.getRowKey(row) === value.rowKey ? { ...row, ...value.changes } : row
    ),
    { type: "patch", key: value.rowKey, changes: value.changes }
  );
}
function replace(next: Row[], change: CrudChildTableChange<Row, Key>) {
  props.binding.replace(props.normalizeRows?.(next, change) ?? next);
}
const fieldSlot = (key: FieldKey<Row>) => `field-${key}` as keyof typeof slots;
const columnSlot = (key: FieldKey<Row>) => `column-${key}` as keyof typeof slots;
function rowLabel(key: Key) {
  const index = rows.value.findIndex((row) => props.getRowKey(row) === key);
  return index >= 0 ? `第 ${index + 1} 行` : undefined;
}
async function beforeLocate(key: Key) {
  await props.activate?.();
  const index = rows.value.findIndex((row) => props.getRowKey(row) === key);
  if (index >= 0) pageNum.value = Math.floor(index / pageSize.value) + 1;
  await nextTick();
}
const unregister = props.binding.register({
  snapshotDraft(fields) {
    return {
      rows: rows.value.map((row) => {
        const values: Partial<Row> = {};
        for (const field of fields) values[field] = cloneModel(row[field]);
        return { rowKey: props.getRowKey(row), values };
      }),
      active: table.value?.snapshotDraft(fields) ?? null,
    };
  },
  async restoreDraft(snapshot, fields) {
    if (
      props.binding.readonly ||
      !snapshot ||
      typeof snapshot !== "object" ||
      !("rows" in snapshot) ||
      !Array.isArray(snapshot.rows)
    )
      return false;
    const seen = new Set<Key>();
    const restored: Row[] = [];
    const baseline = new Map(rows.value.map((row) => [props.getRowKey(row), row]));
    const entries: readonly unknown[] = snapshot.rows;
    for (const item of entries) {
      if (
        !item ||
        typeof item !== "object" ||
        !("rowKey" in item) ||
        !["string", "number"].includes(typeof item.rowKey) ||
        !("values" in item) ||
        !item.values ||
        typeof item.values !== "object"
      )
        return false;
      const base = baseline.get(item.rowKey as Key);
      const row = base ? cloneModel(base) : props.createInitialRow();
      const readonlyFields = new Set(
        normalizeFields(props.fields, {
          model: row,
          context: props.context,
          mode: "edit",
        })
          .filter((entry) => entry.form?.readonly)
          .map((entry) => entry.field.key)
      );
      for (const field of fields) {
        if (!readonlyFields.has(field) && Object.hasOwn(item.values, field))
          // 本地草稿允许未通过业务校验的字段，恢复仅按已声明白名单选取。
          row[field] = cloneModel(Reflect.get(item.values, field)) as Row[typeof field];
      }
      const key = props.getRowKey(row);
      if (key !== item.rowKey || seen.has(key)) return false;
      seen.add(key);
      restored.push(row);
    }
    const active = "active" in snapshot ? snapshot.active : null;
    if (
      active &&
      (typeof active !== "object" ||
        !("rowKey" in active) ||
        !seen.has(active.rowKey as Key) ||
        !("values" in active) ||
        !active.values ||
        typeof active.values !== "object")
    )
      return false;
    table.value?.cancelEdit();
    props.binding.replace(restored);
    await nextTick();
    return (
      !active || !!(await table.value?.restoreDraft(active as TableDraftSnapshot<Row, Key>, fields))
    );
  },
  subscribeDraft(listener) {
    draftListeners.add(listener);
    return () => {
      draftListeners.delete(listener);
    };
  },
  isDirty: () => hasDraft.value,
  commit: async () => !!(await table.value?.commitEdit()),
  cancel: () => table.value?.cancelEdit(),
  async validate(value) {
    return (
      (await table.value?.validate(value)) ?? {
        valid: false,
        errors: [{ rowKey: "", field: props.fields[0]!.key, message: "明细表格尚未就绪" }],
      }
    );
  },
  async focus(key, field) {
    const row = rows.value.find((row) => props.getRowKey(row) === key);
    const column = props.fields.find((item) => item.key === field);
    if (row && column) await table.value?.focusCell(props.getRowKey(row), column.key);
  },
});
onBeforeUnmount(() => {
  draftListeners.clear();
  unsubscribeTableDraft?.();
  unregister();
});
</script>
