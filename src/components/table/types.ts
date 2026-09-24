import type { FieldKey, FieldLink } from "@/components/business/fields/types";
import type { DeepReadonly } from "vue";

export interface TableColumn<Row> extends TableViewColumn<Row> {
  /** 是否允许点击表头排序，默认 false；后端必须验证排序 key。 */
  sortable?: boolean;
  /** 自定义单元格插槽名，格式 column-<字段名>；省略使用字段默认展示。 */
  slot?: `column-${string}`;
}
export interface TableEngineOptions {
  stripe?: boolean;
}
export interface TablePagination {
  pageNum: number;
  pageSize: number;
  total: number;
}
export interface TableSort<Row> {
  key: FieldKey<Row>;
  order: "asc" | "desc";
}
export interface TableSelection<Key extends string | number> {
  mode: "single" | "multiple";
  keys: readonly Key[];
  preserveOnPageChange?: boolean;
}
export interface TableEdit<Row, C> {
  createInitialRow: () => Row;
  links?: readonly FieldLink<Row, C>[];
  /** 简单字段使用行内编辑；复杂字段按工作宽度选择统一弹窗或抽屉。 */
  presentation?: "inline" | "dialog" | "drawer";
  dialog?: {
    title?: string | ((row: Readonly<Row>) => string);
    width?: string | number;
    columns?: 1 | 2 | 3;
  };
  drawer?: {
    title?: string | ((row: Readonly<Row>) => string);
    width?: string | number;
    columns?: 1 | 2 | 3;
  };
  /** 受控 row-add/row-remove 由调用方同步更新 rows，默认不生成按钮以兼容旧页面。 */
  allowAdd?: boolean;
  allowRemove?: boolean;
}
export interface TableValidation<Row, Key> {
  valid: boolean;
  stale?: boolean;
  errors: { rowKey: Key; field: FieldKey<Row>; message: string; moduleKey?: string }[];
}
export interface TableDraftSnapshot<Row, Key> {
  rowKey: Key;
  values: Partial<Row>;
  isNew?: boolean;
}
export interface MyTableExpose<Row, Key> {
  snapshotDraft: (fields: readonly FieldKey<Row>[]) => TableDraftSnapshot<Row, Key> | null;
  restoreDraft: (
    snapshot: TableDraftSnapshot<Row, Key>,
    fields: readonly FieldKey<Row>[]
  ) => Promise<boolean>;
  subscribeDraft: (listener: () => void) => () => void;
  startEdit: (key: Key, field?: FieldKey<Row>) => Promise<boolean>;
  commitEdit: () => Promise<boolean>;
  cancelEdit: () => void;
  /** 接受普通行或整单的深只读快照；校验器内部复制一次，调用前无需另建可变副本。 */
  validate: (
    rows?: readonly Row[] | DeepReadonly<readonly Row[]>
  ) => Promise<TableValidation<Row, Key>>;
  focusCell: (key: Key, field: FieldKey<Row>) => Promise<void>;
  addRow: () => Promise<boolean>;
  removeRow: (key: Key) => Promise<boolean>;
}

export interface TableViewColumn<Row> {
  /** 行模型的真实属性名，也是列偏好及排序使用的稳定 key。 */
  key: Extract<keyof Row, string>;
  /** 中文列标题，例如“客户名称”；不影响字段 key。 */
  label: string;
  /** 声明两层表头的上级分组；省略时保持单层表头。 */
  headerGroup?: TableHeaderGroup;
  /**
   * 业务列的首选宽度（也是用户拖拽后保存的宽度）。
   * 普通列会作为最小宽度参与剩余空间分配；固定列保持精确宽度。
   * @example `width: 180`
   */
  width?: number;
  /**
   * 列允许收缩到的最小宽度；未传时回退 width，再未传时回退 120px。
   * @example `minWidth: 140`
   */
  minWidth?: number;
  /** 横向滚动时固定在左/右侧；省略不固定。 */
  fixed?: "left" | "right";
  /** 单元格对齐，默认 left；金额通常 right，状态通常 center。 */
  align?: "left" | "center" | "right";
  /**
   * 当前行 → 纯文本；可组合多个属性，不能改原行或发请求。
   * @example
   * `format: row => [row.provinceName, row.cityName].filter(Boolean).join(" / ")`
   */
  format?: (row: Readonly<Row>) => string;
}

export interface TableHeaderGroup {
  /** 同组列共用的稳定标识，例如 profile。 */
  key: string;
  /** 分组表头中文名，例如“客户资料”。 */
  label: string;
  /** 分组标题默认对齐；叶子列仍使用各自 align。 */
  align?: "left" | "center" | "right";
  /** 分组默认固定区域；CRUD 用户偏好可整体覆盖。 */
  fixed?: "left" | "right";
}

export interface TableViewColumnBand<Row> {
  key: string;
  group?: TableHeaderGroup;
  fixed?: "left" | "right";
  columns: TableViewColumn<Row>[];
}

export interface TableViewRowEvent<Row, Key extends string | number> {
  /** 触发行事件的只读业务记录。 */
  row: Readonly<Row>;
  /** 记录稳定 ID，保留数字或字符串类型。 */
  rowKey: Key;
  /** 原生鼠标事件；可判断点击次数和控件来源，程序触发时可能省略。 */
  originalEvent?: MouseEvent;
}

/** MyTable 的公开事件参数说明，供模板事件悬停和调用方适配使用。 */
export type MyTableEmits<Row extends object, Key extends string | number> = {
  /**
   * 内置分页器切换页码或每页条数；pageNum 从 1 开始。
   * @example `<MyTable @page-change="({ pageNum, pageSize }) => queryPage(pageNum, pageSize)" />`
   */
  "page-change": [value: { pageNum: number; pageSize: number }];
  /**
   * 用户改变排序列或取消排序；null 表示无排序。
   * @example `<MyTable @sort-change="(sort) => controller.setSort(sort)" />`
   */
  "sort-change": [value: TableSort<Row> | null];
  /**
   * 当前页选择集变更，同时返回该页记录；keys 是稳定主键。
   * @example `<MyTable @selection-change="({ keys }) => controller.select(keys)" />`
   */
  "selection-change": [value: { keys: Key[]; currentPageRows: Row[] }];
  /**
   * 行内编辑提交字段改动；调用方负责将 changes 合并回受控 rows。
   * @example `<MyTable @row-patch="({ rowKey, changes }) => patchRow(rowKey, changes)" />`
   */
  "row-patch": [value: { rowKey: Key; changes: Partial<Row> }];
  /**
   * 用户请求新增一行；调用方负责将 row 加入受控 rows。
   * @example `<MyTable @row-add="(row) => rows.push(row)" />`
   */
  "row-add": [row: Row];
  /**
   * 用户请求删除一行；调用方负责从受控 rows 中移除。
   * @example `<MyTable @row-remove="(key) => removeRow(key)" />`
   */
  "row-remove": [key: Key];
  /**
   * 单击数据行，携带只读行数据及其稳定主键。
   * @example `<MyTable @row-click="({ rowKey }) => openDetail(rowKey)" />`
   */
  "row-click": [value: TableViewRowEvent<Row, Key>];
  /**
   * 双击数据行，携带只读行数据及其稳定主键。
   * @example `<MyTable @row-dblclick="({ row }) => beginEdit(row)" />`
   */
  "row-dblclick": [value: TableViewRowEvent<Row, Key>];
  /**
   * 用户调整列宽；调用方可将结果写入用户列偏好。
   * @example `<MyTable @column-resize="({ key, width }) => preferences.update(key, { width })" />`
   */
  "column-resize": [value: { key: FieldKey<Row>; width: number }];
  /**
   * 表格内部行编辑草稿是否存在变更，适合接入页面离开保护。
   * @example `<MyTable @draft-change="(active) => setDirty(active)" />`
   */
  "draft-change": [active: boolean];
};
