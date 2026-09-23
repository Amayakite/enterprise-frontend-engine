import type { PopoverProps } from "element-plus";
import type { PageResult } from "@/types/http";

/** 旧表格选择器的行记录；读取未知字段前必须收窄类型。新业务优先使用 MyReference。 */
export type IObject = Record<string, unknown>;
/** 旧选择器查询参数，分页固定为数字，其他字段由数据源自行校验。 */
export interface TableSelectQuery {
  /** 从 1 开始的页码，重置查询时恢复为 1。 */
  pageNum: number;
  /** 每页条数，默认 10。 */
  pageSize: number;
  /** 用户输入的动态条件；数据源应显式转换为业务 DTO，不直接断言。 */
  [key: string]: unknown;
}
/** 旧表格选择器公开接口说明；保留兼容用途，不增加第二套参照框架。
 * @typeParam Query 数据源接受的查询模型，默认 TableSelectQuery。
 * @typeParam Row 完整行类型，默认未知字段记录；确认事件保持同一行类型。
 * @example
 * `const config: ISelectConfig = { indexAction: query => load(query), formItems: [], tableColumns: [] };`
 */
export interface ISelectConfig<Query = TableSelectQuery, Row extends object = IObject> {
  /** 输入区宽度；默认 100%。 */
  width?: string;
  /** 未选择时显示的文案；默认“请选择”。 */
  placeholder?: string;
  /** Element Plus Popover 公开属性；组件自身管理 visible。 */
  popover?: Partial<Omit<PopoverProps, "visible" | "v-model:visible">>;
  /** 查询数据源；返回 list/total，失败拒绝 Promise，不修改输入。
   * @example
   * `indexAction: query => API.getPage(query)`
   */
  indexAction: (query: Query) => Promise<PageResult<Row>>;
  /** 稳定行键字段；默认 id，数据源必须提供，不改变 ID 类型。 */
  pk?: string;
  /** 是否多选；默认 false，不在一次选择会话中切换。 */
  multiple?: boolean;
  /** 查询控件；空数组表示无查询字段。 */
  formItems: Array<{
    /** 控件类型；省略使用 input。 */
    type?: "input" | "select" | "tree-select" | "date-picker";
    /** 查询标签文案。 */
    label: string;
    /** 查询字段名；不要覆盖 pageNum/pageSize。 */
    prop: string;
    /** 相应 Element Plus 控件的公开属性；不传实例或内部 DOM。 */
    attrs?: Record<string, unknown>;
    /** 初始值；省略按空字符串处理。 */
    initialValue?: unknown;
    /** select 候选值；省略为空列表。 */
    options?: Array<{
      /** 候选显示名称。 */
      label: string;
      /** 原始候选值，保留 string/number/boolean 类型。 */
      value: string | number | boolean;
    }>;
  }>;
  /** 表格列；通过公开插槽扩展内容。 */
  tableColumns: Array<{
    /** 列类型；省略为普通数据列。 */
    type?: "default" | "selection" | "index" | "expand";
    /** 表头名称；系统列可省略。 */
    label?: string;
    /** 行字段名；系统列可省略。 */
    prop?: string;
    /** 列宽；省略使用表格默认值。 */
    width?: string | number;
    /** custom 使用命名插槽；省略使用普通单元格。 */
    templet?: "custom";
    /** 自定义插槽名；默认使用 prop。 */
    slotName?: string;
    /** 多选列跨页保留选择；组件会为 selection 列开启。 */
    reserveSelection?: boolean;
    /** 其他 Element Plus TableColumn 公开属性；具体值由该组件校验。 */
    [key: string]: unknown;
  }>;
}
