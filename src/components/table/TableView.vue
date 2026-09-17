<template>
  <div ref="root" class="table-view" :style="rootStyle" :aria-busy="loading">
    <span class="sr-only" role="status" aria-live="polite">
      {{ loading ? "正在更新表格数据" : "" }}
    </span>
    <el-alert v-if="tableError" :title="tableError" type="error" :closable="false" />
    <VxeTable
      v-else
      ref="engine"
      :data="prepared.rows"
      :height="resolvedHeight"
      :size="size"
      :fit="fit"
      :loading="loading"
      :stripe="stripe"
      :column-config="{ useKey: true, resizable: true, isHover: true }"
      :resizable-config="{ minWidth: 64, maxWidth: 1000 }"
      :row-class-name="rowClassName"
      :row-config="{ keyField: 'stableKey', useKey: true, isHover: true }"
      :scroll-x="{ enabled: true, gt: 0 }"
      :scroll-y="{ enabled: false }"
      :show-overflow="wrapCells ? false : 'tooltip'"
      @cell-click="onCellClick"
      @cell-dblclick="onCellDblclick"
      @resizable-change="onResizableChange"
    >
      <!-- 系统边界列与业务表头进入同一个有序序列，避免条件节点改变 VXE 的列注册顺序。 -->
      <template v-for="band in renderedBands" :key="band.key">
        <VxeColumn
          v-if="band.system === 'leading'"
          :width="leading?.width"
          :title="leading?.label"
          :resizable="false"
          fixed="left"
        >
          <template #header>
            <slot name="leading-header">{{ leading?.label }}</slot>
          </template>
          <template #default="{ row }">
            <slot name="leading-cell" :row="recordOf(row)" :row-key="keyOf(row)" />
          </template>
        </VxeColumn>
        <VxeColumn
          v-else-if="band.system === 'trailing'"
          :width="trailing?.width"
          :title="trailing?.label"
          :resizable="false"
          fixed="right"
        >
          <template #default="{ row }">
            <slot name="trailing-cell" :row="recordOf(row)" :row-key="keyOf(row)" />
          </template>
        </VxeColumn>
        <VxeColgroup
          v-else-if="band.group"
          :title="band.group.label"
          :fixed="band.fixed"
          :header-align="band.group.align ?? 'center'"
        >
          <VxeColumn
            v-for="column in band.columns"
            :key="column.key"
            :field="`record.${column.key}`"
            :title="column.label"
            :width="resolvedColumnWidth(column)"
            :min-width="resolvedColumnMinWidth(column)"
            :align="column.align ?? 'left'"
            :resizable="true"
          >
            <template #header>
              <slot :name="`header-${column.key}`" :column="column">{{ column.label }}</slot>
            </template>
            <template #default="{ row }">
              <slot :name="`column-${column.key}`" :row="recordOf(row)" :row-key="keyOf(row)">
                {{ column.format ? column.format(recordOf(row)) : recordOf(row)[column.key] }}
              </slot>
            </template>
          </VxeColumn>
        </VxeColgroup>
        <VxeColumn
          v-else
          :field="`record.${band.columns[0]!.key}`"
          :title="band.columns[0]!.label"
          :width="resolvedColumnWidth(band.columns[0]!)"
          :min-width="resolvedColumnMinWidth(band.columns[0]!)"
          :fixed="band.columns[0]!.fixed"
          :align="band.columns[0]!.align ?? 'left'"
          :resizable="true"
        >
          <template #header>
            <slot :name="`header-${band.columns[0]!.key}`" :column="band.columns[0]!">
              {{ band.columns[0]!.label }}
            </slot>
          </template>
          <template #default="{ row }">
            <slot
              :name="`column-${band.columns[0]!.key}`"
              :row="recordOf(row)"
              :row-key="keyOf(row)"
            >
              {{
                band.columns[0]!.format
                  ? band.columns[0]!.format!(recordOf(row))
                  : recordOf(row)[band.columns[0]!.key]
              }}
            </slot>
          </template>
        </VxeColumn>
      </template>
      <template #loading>
        <div class="table-view__loading" aria-hidden="true">
          <span class="table-view__loading-mark">
            <span class="table-view__loading-icon ui-refresh-icon is-spinning i-svg:refresh" />
          </span>
          <strong>正在更新数据</strong>
          <small>请稍候，表格会自动显示最新结果</small>
        </div>
      </template>
      <template #empty><slot name="empty">暂无数据</slot></template>
    </VxeTable>
  </div>
</template>

<script setup lang="ts" generic="Row extends object, Key extends string | number">
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { useResizeObserver } from "@vueuse/core";
import { VxeTable } from "vxe-table/es/table";
import { VxeColumn } from "vxe-table/es/column";
import { VxeColgroup } from "vxe-table/es/colgroup";
import type { VxeTableEvents, VxeTableInstance } from "vxe-table";
import type { TableViewColumn, TableViewColumnBand, TableViewRowEvent } from "./types";
import { configureVxeTable } from "./vxe-config";
import { buildTableColumnBands } from "./columns";
import { serializeStableKey } from "@/utils/identity";

const props = withDefaults(
  defineProps<{
    rows: readonly Row[];
    columns: readonly TableViewColumn<Row>[];
    getRowKey: (row: Readonly<Row>) => Key;
    height?: number | string;
    minHeight?: number | string;
    loading?: boolean;
    stripe?: boolean;
    wrapCells?: boolean;
    /** 紧凑浮层可单独缩小 VXE 表头与行高，普通业务表维持 medium。 */
    size?: "medium" | "small" | "mini";
    /** 关闭自动撑满，使参照列宽由 source 配置主导。 */
    fit?: boolean;
    currentRowKey?: NoInfer<Key> | null;
    /** 仅行编辑表格需要让当前行控件从顶部对齐；参照候选保持垂直居中。 */
    currentRowTopAlign?: boolean;
    errorRowKeys?: readonly NoInfer<Key>[];
    /** 插槽内容或错误状态改变时通知 VXE 重算动态行高。 */
    layoutRevision?: number;
    leading?: { label?: string; width: number };
    trailing?: { label?: string; width: number };
  }>(),
  {
    height: 360,
    loading: false,
    stripe: true,
    size: "medium",
    fit: true,
    currentRowTopAlign: false,
  }
);
const emit = defineEmits<{
  /**
   * 用户单击数据行；row 为只读业务行，rowKey 为稳定主键。
   * @example `<TableView @row-click="({ rowKey }) => openDetail(rowKey)" />`
   */
  "row-click": [event: TableViewRowEvent<Row, Key>];
  /**
   * 用户双击数据行；用于按业务需要进入编辑或详情。
   * @example `<TableView @row-dblclick="({ row }) => beginEdit(row)" />`
   */
  "row-dblclick": [event: TableViewRowEvent<Row, Key>];
  /**
   * 用户调整列宽；宿主负责写入列偏好。
   * @example `<TableView @column-resize="({ key, width }) => preferences.update(key, { width })" />`
   */
  "column-resize": [value: { key: Extract<keyof Row, string>; width: number }];
}>();
defineSlots<
  {
    [name: `column-${string}`]: (props: { row: Readonly<Row>; rowKey: Key }) => unknown;
  } & { [name: `header-${string}`]: (props: { column: TableViewColumn<Row> }) => unknown } & {
    "leading-header": () => unknown;
    empty: () => unknown;
    "leading-cell": (props: { row: Readonly<Row>; rowKey: Key }) => unknown;
    "trailing-cell": (props: { row: Readonly<Row>; rowKey: Key }) => unknown;
  }
>();

configureVxeTable();
const root = ref<HTMLElement>();
const engine = ref<VxeTableInstance<EngineRow>>();
const measuredHeight = ref(0);
const numericHeight = computed(() => {
  if (typeof props.height === "number") return props.height;
  const value = props.height.trim();
  if (!value) return;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
});
const usesCssHeight = computed(
  () =>
    typeof props.height === "string" && props.height !== "auto" && numericHeight.value === undefined
);
const rootStyle = computed(() => ({
  ...(usesCssHeight.value ? { height: props.height as string } : {}),
  ...(props.minHeight !== undefined
    ? { minHeight: typeof props.minHeight === "number" ? `${props.minHeight}px` : props.minHeight }
    : {}),
}));
const resolvedHeight = computed<number | string | undefined>(() =>
  props.height === "auto"
    ? undefined
    : usesCssHeight.value
      ? measuredHeight.value || undefined
      : (numericHeight.value ?? props.height)
);

const active = ref(true);
let measurementFrame: number | undefined;
function syncMeasuredHeight() {
  if (!active.value || !usesCssHeight.value || !root.value) return;
  const nextHeight = root.value.clientHeight;
  if (nextHeight > 0 && nextHeight !== measuredHeight.value) measuredHeight.value = nextHeight;
}
function scheduleMeasuredHeight() {
  if (!active.value || measurementFrame !== undefined) return;
  measurementFrame = requestAnimationFrame(() => {
    measurementFrame = undefined;
    syncMeasuredHeight();
  });
}

// VXE 4.6 的百分比高度重算会先使用上一轮 parentHeight，容易在自动 resize 时逐帧增高。
// 先让外层按 CSS 完成布局，再把稳定的像素高度交给内核，calc()/max() 等高度也能正确工作。
// 只在有效高度确实变化时写入；失活后断开观察。保留父布局/弹窗/查询栏改变尺寸的响应，
// 使用观察器提供的布局高度，不读取受页面缩放动画影响的 getBoundingClientRect。
onMounted(() => {
  void nextTick(scheduleMeasuredHeight);
});
useResizeObserver(
  computed(() => (active.value && usesCssHeight.value ? root.value : undefined)),
  ([entry]) => {
    if (!entry || !active.value) return;
    const height = Math.floor(entry.contentRect.height);
    if (height > 0 && height !== measuredHeight.value) measuredHeight.value = height;
  }
);
onBeforeUnmount(() => {
  active.value = false;
  if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
});
onDeactivated(() => {
  active.value = false;
  if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
  measurementFrame = undefined;
});
onActivated(() => {
  active.value = true;
  void nextTick(scheduleMeasuredHeight);
});
watch(
  () => props.height,
  () => {
    measuredHeight.value = 0;
    scheduleMeasuredHeight();
  },
  { flush: "sync" }
);
async function recalculate() {
  await nextTick();
  if (!active.value) return;
  await engine.value?.recalculate(true);
}
defineExpose({
  recalculate,
  async scrollToCell(key: Key, field: Extract<keyof Row, string>) {
    await recalculate();
    const row = prepared.value.rows.find((row) => row.businessKey === key);
    if (row) await engine.value?.scrollToRow(row, `record.${field}`);
  },
});

interface EngineRow {
  stableKey: string;
  businessKey: Key;
  record: Row;
}
interface RenderBand extends TableViewColumnBand<Row> {
  system?: "leading" | "trailing";
}

// VXE 将行 ID 转成字符串；用独立包装行隔离内核字段，不修改业务数据或依赖行索引。
const prepared = computed(() => {
  try {
    const keys = new Set<string>();
    const rows = props.rows.map((record): EngineRow => {
      const businessKey = props.getRowKey(record);
      const stableKey = serializeStableKey(businessKey);
      if (keys.has(stableKey)) throw new Error(`TableView 检测到重复行键：${stableKey}`);
      keys.add(stableKey);
      return { stableKey, businessKey, record };
    });
    return { rows, error: "" };
  } catch (error) {
    // 拒绝整页歧义数据，不用索引替代，也不让一次渲染错误击穿应用布局。
    return { rows: [], error: error instanceof Error ? error.message : "行键无效" };
  }
});
const preparedColumns = computed(() => {
  try {
    return { bands: buildTableColumnBands(props.columns), error: "" };
  } catch (error) {
    return {
      bands: [] as TableViewColumnBand<Row>[],
      error: error instanceof Error ? error.message : "多级表头配置无效",
    };
  }
});
const renderedBands = computed<RenderBand[]>(() => [
  ...(props.leading ? [{ key: "system-leading", system: "leading" as const, columns: [] }] : []),
  ...preparedColumns.value.bands,
  ...(props.trailing ? [{ key: "system-trailing", system: "trailing" as const, columns: [] }] : []),
]);
const tableError = computed(() => prepared.value.error || preparedColumns.value.error);
watch([prepared, renderedBands, () => props.layoutRevision], recalculate, { flush: "post" });

/**
 * 业务列的 width 表示用户偏好宽度，不应在容器有剩余空间时留下大片空白。
 * 非固定列将 width 合并为 minWidth，交给 VXE 在宽容器内分配剩余空间；
 * 容器变窄时仍以该值为下限并启用横向滚动。固定列保留精确宽度，
 * 避免固定区在自动铺满时改变操作列/选择列的预期位置。
 */
function resolvedColumnWidth(column: TableViewColumn<Row>): number | undefined {
  return column.fixed ? column.width : undefined;
}

function resolvedColumnMinWidth(column: TableViewColumn<Row>): number {
  const configured = Math.max(column.width ?? 0, column.minWidth ?? 0);
  return Math.max(64, configured || 120);
}

// VXE 4.6 的插槽声明将 row 擦除为 any；仅在内核边界恢复本组件构造的包装行类型。
function recordOf(row: EngineRow): Readonly<Row> {
  return row.record;
}
function keyOf(row: EngineRow): Key {
  return row.businessKey;
}
const onCellClick: VxeTableEvents.CellClick<EngineRow> = ({ row }) => {
  emit("row-click", { row: row.record, rowKey: row.businessKey });
};
const onCellDblclick: VxeTableEvents.CellDblclick<EngineRow> = ({ row }) => {
  emit("row-dblclick", { row: row.record, rowKey: row.businessKey });
};
const onResizableChange: VxeTableEvents.ResizableChange<EngineRow> = ({ column, resizeWidth }) => {
  const field = String(column.field ?? "");
  if (!field.startsWith("record.")) return;
  const key = field.slice("record.".length) as Extract<keyof Row, string>;
  if (props.columns.some((item) => item.key === key))
    emit("column-resize", { key, width: resizeWidth });
};
function rowClassName({ row }: { row: EngineRow }) {
  return [
    row.businessKey === props.currentRowKey
      ? `table-view__current${props.currentRowTopAlign ? " table-view__current--top" : ""}`
      : "",
    props.errorRowKeys?.includes(row.businessKey) ? "table-view__error" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
</script>

<style scoped lang="scss">
.table-view {
  box-sizing: border-box;
  :deep(.table-view__current) {
    background-color: var(--el-color-primary-light-9);
  }
  // 编辑行各列可能包含帮助、错误或状态；统一从顶部建立输入控件基线。
  :deep(.table-view__current--top > .vxe-body--column) {
    vertical-align: top;
  }
  :deep(.table-view__error) {
    box-shadow: inset 3px 0 0 var(--el-color-danger);
  }
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);

  :deep(.vxe-loading) {
    background: color-mix(in srgb, var(--content-bg) 82%, transparent);
    backdrop-filter: blur(1.5px);
  }

  // full 模式提供单元格竖线，外框仍由 TableView 控制圆角与主题色。
  :deep(.vxe-table--border-line) {
    display: none;
  }

  :deep(.vxe-body--row),
  :deep(.vxe-body--column),
  :deep(.vxe-header--column) {
    transition:
      background-color 140ms ease-out,
      box-shadow 140ms ease-out;
  }
}
.table-view__loading {
  display: grid;
  justify-items: center;
  gap: 7px;
  color: var(--el-text-color-primary);
  animation: table-loading-enter 180ms ease-out both;

  strong {
    font-size: 14px;
    font-weight: 600;
  }

  small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
}
.table-view__loading-mark {
  position: relative;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 50%;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--el-color-primary) 16%, transparent);
}
.table-view__loading-icon {
  width: 20px;
  height: 20px;
}
@keyframes table-loading-enter {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .table-view__loading {
    animation: none;
  }

  .table-view {
    :deep(.vxe-body--row),
    :deep(.vxe-body--column),
    :deep(.vxe-header--column) {
      transition: none;
    }
  }
}
</style>
