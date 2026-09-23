<template>
  <!-- 编辑联系人、地址等子表。传入 binding、fields、context 和行配置，行确认后更新主表中的数组；点击主表保存时一并提交。 -->
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
     * 子表编辑界面的显示方式，默认 inline。
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
/** 内部 MyTable 的公开方法，整单保存时用它确认当前编辑行、校验和定位错误。 */
const table = ref<MyTableExpose<Row, Key>>();
/** 主表注册的草稿变化监听；子表输入或行数据变化时通知它们保存草稿。 */
const draftListeners = new Set<() => void>();
/** 通知所有草稿监听者子表已变化，不直接发送保存请求。 */
const notifyDraft = () => draftListeners.forEach((listener) => listener());
/** 保留当前表格草稿订阅的取消函数，更换表格实例或卸载时释放旧订阅。 */
let unsubscribeTableDraft: (() => void) | undefined;
/** 内部表格实例变化时重新订阅行草稿，先取消旧实例的订阅，避免重复通知。 */
watch(table, (value) => {
  unsubscribeTableDraft?.();
  unsubscribeTableDraft = value?.subscribeDraft(notifyDraft);
});
/** 已确认的子表行被替换时也通知草稿保存，不能只监听尚未确认的编辑行。 */
watch(() => props.binding.rows, notifyDraft);
/** 表格是否存在尚未确认的行修改，用于主表的未保存提示。 */
const hasDraft = ref(false);
/** 子表当前页码和每页条数，仅控制前端显示，保存时仍提交所有行。 */
const pageNum = ref(1),
  pageSize = ref(props.pageSize);
/** 从主表读取完整子表数组，主表回填或恢复草稿后会随之更新。 */
const sourceRows = computed(() => props.binding.rows);
/** 给表格和插槽使用的只读行副本，修改需通过 add/remove/patch 回写。 */
const rows = computed(() => cloneReadonlyModel<Row[]>(sourceRows.value));
/** 行数超过配置条数时才显示分页，少量明细直接全部展示。 */
const paginated = computed(() => rows.value.length > props.pageSize);
/** 从完整子表截取当前页，只影响画面，不裁剪主表要保存的数据。 */
const pageRows = computed(() =>
  paginated.value
    ? rows.value.slice((pageNum.value - 1) * pageSize.value, pageNum.value * pageSize.value)
    : rows.value
);
/** 删除行后修正当前页，避免停留在已经不存在的最后一页。 */
watch(
  () => rows.value.length,
  () => {
    pageNum.value = Math.min(
      pageNum.value,
      Math.max(1, Math.ceil(rows.value.length / pageSize.value))
    );
  }
);
/** 追加新行并跳到最后一页，让用户立即看到刚新增的明细。 */
function add(row: Row) {
  replace([...rows.value, row], { type: "add", key: props.getRowKey(row) });
  pageNum.value = Math.max(1, Math.ceil(rows.value.length / pageSize.value));
}
/** 按稳定行 ID 删除对应明细，再执行子表统一规则并回写主表。 */
function remove(key: Key) {
  replace(
    rows.value.filter((row) => props.getRowKey(row) !== key),
    { type: "remove", key }
  );
}
/** 只合并目标行的变化，保留其他明细，再执行子表统一规则。 */
function patch(value: { rowKey: Key; changes: Partial<Row> }) {
  replace(
    rows.value.map((row) =>
      props.getRowKey(row) === value.rowKey ? { ...row, ...value.changes } : row
    ),
    { type: "patch", key: value.rowKey, changes: value.changes }
  );
}
/** 所有增删改共同经过这里；先执行 normalizeRows 业务规则，再替换主表里的子表数组。 */
function replace(next: Row[], change: CrudChildTableChange<Row, Key>) {
  props.binding.replace(props.normalizeRows?.(next, change) ?? next);
}
/** 生成 field-* 插槽名，透传当前行的自定义输入控件。 */
const fieldSlot = (key: FieldKey<Row>) => `field-${key}` as keyof typeof slots;
/** 生成 column-* 插槽名，透传当前行的自定义只读单元格。 */
const columnSlot = (key: FieldKey<Row>) => `column-${key}` as keyof typeof slots;
/** 根据完整子表位置生成“第几行”，使错误行号不随分页变化。 */
function rowLabel(key: Key) {
  const index = rows.value.findIndex((row) => props.getRowKey(row) === key);
  return index >= 0 ? `第 ${index + 1} 行` : undefined;
}
/** 定位错误前先打开子表分区，再跳到目标行所在页，等待 DOM 更新后才能聚焦。 */
async function beforeLocate(key: Key) {
  await props.activate?.();
  const index = rows.value.findIndex((row) => props.getRowKey(row) === key);
  if (index >= 0) pageNum.value = Math.floor(index / pageSize.value) + 1;
  await nextTick();
}
/** 向主表登记子表草稿、校验、确认和定位方法，使整单保存能检查全部明细；卸载时取消登记。 */
const unregister = props.binding.register({
  /** 保存允许的子表字段和仍在编辑的行，恢复后可继续未完成的输入。 */
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
  /** 按行 ID 恢复允许的字段，跳过只读项；结构错误或重复 ID 时拒绝恢复。 */
  async restoreDraft(snapshot, fields) {
    if (
      props.binding.readonly ||
      !snapshot ||
      typeof snapshot !== "object" ||
      !("rows" in snapshot) ||
      !Array.isArray(snapshot.rows)
    )
      return false;
    // 先在临时数组中完整检查并重建所有行，发现坏数据时不改当前子表。
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
      // 已有行沿用当前基线，新行使用默认值；草稿只覆盖白名单内且可编辑的字段。
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
    // 整份行数据通过检查后再替换；等表格接收新行，再恢复尚未确认的活动行草稿。
    table.value?.cancelEdit();
    props.binding.replace(restored);
    await nextTick();
    return (
      !active || !!(await table.value?.restoreDraft(active as TableDraftSnapshot<Row, Key>, fields))
    );
  },
  /** 主表订阅子表草稿变化，返回取消函数，避免卸载后仍通知。 */
  subscribeDraft(listener) {
    draftListeners.add(listener);
    return () => {
      draftListeners.delete(listener);
    };
  },
  isDirty: () => hasDraft.value,
  commit: async () => !!(await table.value?.commitEdit()),
  cancel: () => table.value?.cancelEdit(),
  /** 整单保存时检查全部明细；表格尚未挂载则返回错误，不能跳过子表校验。 */
  async validate(value) {
    return (
      (await table.value?.validate(value)) ?? {
        valid: false,
        errors: [{ rowKey: "", field: props.fields[0]!.key, message: "明细表格尚未就绪" }],
      }
    );
  },
  /** 将子表错误定位到具体行和字段，没有字段时回到正在编辑的行或第一行。 */
  async focus(key, field) {
    // 整个分区/活动草稿错误可能没有列定位；沿公开草稿快照回到正在编辑的行。
    const draftKey = !field ? table.value?.snapshotDraft([])?.rowKey : undefined;
    const row = field
      ? rows.value.find((row) => props.getRowKey(row) === key)
      : (rows.value.find((row) => props.getRowKey(row) === draftKey) ?? rows.value[0]);
    const column = field
      ? props.fields.find((item) => item.key === field)
      : props.fields.find((item) => !!item.form);
    if (row && column) await table.value?.focusCell(props.getRowKey(row), column.key);
  },
});
/** 清理草稿订阅和主表登记，避免后台继续调用已销毁的表格。 */
onBeforeUnmount(() => {
  draftListeners.clear();
  unsubscribeTableDraft?.();
  unregister();
});
</script>
