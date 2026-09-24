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
      <template #empty>
        <div role="status"><slot name="empty">暂无数据</slot></div>
      </template>
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
   * 用户调整列宽；调用方负责写入列偏好。
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
/** 外层表格容器，用它测量 CSS 高度，避免底层表格用上一轮高度计算出错。 */
const root = ref<HTMLElement>();
/** VXE 表格实例，只在本组件内部调用重算和滚动方法，不向业务页面暴露。 */
const engine = ref<VxeTableInstance<EngineRow>>();
/** CSS 容器实际高度，转换为稳定像素值交给 VXE；0 表示尚未测得有效高度。 */
const measuredHeight = ref(0);
/** 把数字或纯数字字符串识别为像素高度，百分比和 calc 等表达式保留给 CSS。 */
const numericHeight = computed(() => {
  if (typeof props.height === "number") return props.height;
  const value = props.height.trim();
  if (!value) return;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
});
/** 判断高度是否需要先由浏览器布局求值，例如 100% 或 calc(...)。 */
const usesCssHeight = computed(
  () =>
    typeof props.height === "string" && props.height !== "auto" && numericHeight.value === undefined
);
/** 把 CSS 高度和最小高度设置在外层容器，数字最小高度自动补 px。 */
const rootStyle = computed(() => ({
  ...(usesCssHeight.value ? { height: props.height as string } : {}),
  ...(props.minHeight !== undefined
    ? { minHeight: typeof props.minHeight === "number" ? `${props.minHeight}px` : props.minHeight }
    : {}),
}));
/** auto 不固定内部高度；CSS 高度使用测量值，数值高度直接传给表格。 */
const resolvedHeight = computed<number | string | undefined>(() =>
  props.height === "auto"
    ? undefined
    : usesCssHeight.value
      ? measuredHeight.value || undefined
      : (numericHeight.value ?? props.height)
);

/** 缓存页面是否正在显示，隐藏期间停止尺寸测量和表格重算。 */
const active = ref(true);
/** 尚未执行的动画帧编号，用于合并尺寸测量并在停用时取消。 */
let measurementFrame: number | undefined;
/** 仅记录可见容器的非零高度，值没变时不写响应式状态，避免重复布局。 */
function syncMeasuredHeight() {
  if (!active.value || !usesCssHeight.value || !root.value) return;
  const nextHeight = root.value.clientHeight;
  if (nextHeight > 0 && nextHeight !== measuredHeight.value) measuredHeight.value = nextHeight;
}
/** 将本轮多次测量请求合并到下一动画帧，减少连续布局读取。 */
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
/** 容器可见且使用 CSS 高度时观察尺寸；直接使用布局高度，避免页面缩放动画干扰测量。 */
useResizeObserver(
  computed(() => (active.value && usesCssHeight.value ? root.value : undefined)),
  ([entry]) => {
    if (!entry || !active.value) return;
    const height = Math.floor(entry.contentRect.height);
    if (height > 0 && height !== measuredHeight.value) measuredHeight.value = height;
  }
);
/** 组件销毁时停止测量并取消尚未执行的动画帧。 */
onBeforeUnmount(() => {
  active.value = false;
  if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
});
/** 标签切走时暂停测量，避免隐藏容器的零尺寸覆盖有效高度。 */
onDeactivated(() => {
  active.value = false;
  if (measurementFrame !== undefined) cancelAnimationFrame(measurementFrame);
  measurementFrame = undefined;
});
/** 标签恢复后等待布局完成，再读取可用高度。 */
onActivated(() => {
  active.value = true;
  void nextTick(scheduleMeasuredHeight);
});
/** 高度配置改变时清除旧测量值并重新测量，避免沿用上一种高度方式。 */
watch(
  () => props.height,
  () => {
    measuredHeight.value = 0;
    scheduleMeasuredHeight();
  },
  { flush: "sync" }
);
/** 等待 Vue 更新完成后让 VXE 重算列宽和行高；后台缓存页不执行。 */
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
/** 将普通列和分组表头整理为有序结构；配置非法时转成表格内提示。 */
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
/** 把左侧选择列、业务列和右侧操作列放进同一渲染顺序，确保系统列始终在两端。 */
const renderedBands = computed<RenderBand[]>(() => [
  ...(props.leading ? [{ key: "system-leading", system: "leading" as const, columns: [] }] : []),
  ...preparedColumns.value.bands,
  ...(props.trailing ? [{ key: "system-trailing", system: "trailing" as const, columns: [] }] : []),
]);
/** 优先显示行 ID 错误，其次显示表头配置错误，避免无效数据破坏整页。 */
const tableError = computed(() => prepared.value.error || preparedColumns.value.error);
/** 数据、表头顺序或行高版本变化后重算布局，等待 DOM 更新再执行。 */
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

/** 计算列宽下限，至少 64px；没有配置时默认 120px。 */
function resolvedColumnMinWidth(column: TableViewColumn<Row>): number {
  const configured = Math.max(column.width ?? 0, column.minWidth ?? 0);
  return Math.max(64, configured || 120);
}

// VXE 4.6 的插槽声明将 row 擦除为 any；仅在内核边界恢复本组件构造的包装行类型。
function recordOf(row: EngineRow): Readonly<Row> {
  return row.record;
}
/** 从表格包装行取回原类型的业务 ID，保持数字和字符串 ID 不混淆。 */
function keyOf(row: EngineRow): Key {
  return row.businessKey;
}
/** 将 VXE 的单击事件转换为业务行和原始 ID，再通知上层。 */
const onCellClick: VxeTableEvents.CellClick<EngineRow> = ({ row, $event }) => {
  emit("row-click", {
    row: row.record,
    rowKey: row.businessKey,
    originalEvent: $event instanceof MouseEvent ? $event : undefined,
  });
};
/** 将 VXE 的双击事件转换为业务行和原始 ID，供上层打开详情或编辑。 */
const onCellDblclick: VxeTableEvents.CellDblclick<EngineRow> = ({ row, $event }) => {
  emit("row-dblclick", {
    row: row.record,
    rowKey: row.businessKey,
    originalEvent: $event instanceof MouseEvent ? $event : undefined,
  });
};
/** 将底层 record.* 字段名还原为业务列 key，只发布已声明业务列的宽度变化。 */
const onResizableChange: VxeTableEvents.ResizableChange<EngineRow> = ({ column, resizeWidth }) => {
  const field = String(column.field ?? "");
  if (!field.startsWith("record.")) return;
  const key = field.slice("record.".length) as Extract<keyof Row, string>;
  if (props.columns.some((item) => item.key === key))
    emit("column-resize", { key, width: resizeWidth });
};
/** 给当前编辑行和校验失败行添加样式类，编辑行可按配置顶部对齐。 */
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
