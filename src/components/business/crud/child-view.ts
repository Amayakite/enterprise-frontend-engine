import { lazyCrudView, defineCrudAsyncView } from "@/components/business/crud/lazy-view";
import { h, computed } from "vue";
import type { Component, DeepReadonly, Slot, VNode } from "vue";
import type { FieldDefinition, FieldKey } from "../fields/types";
import type { TableEdit } from "@/components/table/types";
import type { CrudTableBinding } from "./types";
import { cloneReadonlyModel } from "../fields/model";
import type ChildTableComponent from "./MyCrudChildTable.vue";
import type TableComponent from "@/components/table/MyTable.vue";

/** 专属子表组件接收的公开 props；编辑传 binding，详情传 rows。 */
export interface CrudChildViewProps<Row extends object> {
  /** 编辑端口；详情为空，组件不能创建另一份主表模型。 */
  binding?: CrudTableBinding<Row>;
  /** 详情展示行副本；编辑时可省略，改用 binding.rows。 */
  rows?: readonly Row[];
}

/** 聚合子表可选视图配置，声明在子表自己的 config.ts。 */
export interface CrudChildView<Row extends object> {
  /** 专属子表组件；省略使用标准子表。仅使用时加载，组件接收 binding 或只读 rows。
   * @example
   * `component: () => import("./CustomerContacts.vue")`
   */
  component?: () => Promise<{
    /** Vue 默认导出组件。 */ default: Component<CrudChildViewProps<Row>>;
  }>;
}
/** 标准子表视图所需配置；旧的纯保存绑定可不配置视图。 */
export interface AggregateViewConfig<Row extends object> {
  /** 自定义视图；未声明时复用默认表格。 */ view?: CrudChildView<Row>;
  /** 子行字段；默认视图必填。 */ fields?: readonly FieldDefinition<Row, undefined>[];
  /** 行稳定键；默认视图必填，保留 ID 类型。 */ getRowKey?: (row: Readonly<Row>) => string | number;
  /** 新增行工厂；默认编辑视图必填，不共享可变对象。 */ createInitialRow?: (
    rows: readonly Row[]
  ) => Row;
  /** 行内、弹窗或抽屉；默认 inline。 */ editPresentation?: "inline" | "dialog" | "drawer";
  /** 弹窗公开设置。 */ editDialog?: TableEdit<Row, undefined>["dialog"];
  /** 抽屉公开设置。 */ editDrawer?: TableEdit<Row, undefined>["drawer"];
  /** 行归一化；省略保留原数组。 */ normalizeRows?: (rows: readonly Row[]) => Row[];
  /** 子行草稿；省略不持久化子行编辑状态。 */ draft?: {
    /** 结构版本。 */ version: number;
    /** 可持久化字段。 */ fields: readonly FieldKey<Row>[];
  };
}
/** 自动装配后的子表渲染端口；高级布局可传入插槽替换默认视图。 */
export interface CrudChildRenderer {
  /** 当前子表编辑端口；详情为 undefined，泛型关系由聚合绑定维护。 */
  readonly binding?: unknown;
  /** 插槽优先，否则专属组件，再否则标准表格。 */ render: (slot?: Slot) => VNode;
}
/**
 * 创建一个子表视图，不创建第二份表单模型。
 * @param config 子表独立配置。
 * @param read 当前主模型子行 getter；按需缓存只读展示副本。
 * @param binding 编辑绑定；详情省略。
 * @returns 默认/自定义视图渲染端口。
 * @example
 * `createChildRenderer(config, readRows, binding)`
 */
export function createChildRenderer<Row extends object>(
  config: AggregateViewConfig<Row>,
  read: () => DeepReadonly<Row[]>,
  binding?: CrudTableBinding<Row>
): CrudChildRenderer {
  const ChildTable = lazyCrudView<
    Parameters<typeof ChildTableComponent<Row, string | number, undefined>>[0]
  >(() => import("./MyCrudChildTable.vue"));
  const Table = lazyCrudView<Parameters<typeof TableComponent<Row, string | number, undefined>>[0]>(
    () => import("@/components/table/MyTable.vue")
  );
  const custom = config.view?.component ? defineCrudAsyncView(config.view.component) : undefined;
  // 主表其他字段更新时，稳定的子数组引用不会触发行副本重建。
  const sourceRows = computed(read);
  const rows = computed(() => cloneReadonlyModel<Row[]>(sourceRows.value));
  return {
    binding,
    render(slot) {
      if (slot) return h("div", slot({ binding, rows: rows.value }));
      if (custom) return h(custom, binding ? { binding } : { rows: rows.value });
      if (!config.fields || !config.getRowKey)
        return h("p", { role: "alert" }, "请在子表 config 配置 fields/getRowKey 或 view.component");
      if (!binding)
        return h(Table, {
          rows: rows.value,
          fields: config.fields,
          getRowKey: config.getRowKey,
          context: undefined,
          height: "auto",
          wrapCells: true,
        });
      const create = config.createInitialRow;
      if (!create) return h("p", { role: "alert" }, "请在子表 config 配置 createInitialRow");
      return h(ChildTable, {
        binding,
        fields: config.fields,
        getRowKey: config.getRowKey,
        context: undefined,
        createInitialRow: () => create(rows.value),
        normalizeRows: config.normalizeRows,
        editPresentation: config.editPresentation,
        editDialog: config.editDialog,
        editDrawer: config.editDrawer,
      });
    },
  };
}
