import type { FieldDefinition } from "@/components/business/fields/types";
import type { TableEdit } from "@/components/table/types";
import type { CrudChildTableChange } from "@/components/business/crud/types";

/** 当前运行时只支持整单聚合保存；独立端点与按模式切换须在真实协议确认后另建合同。 */
export interface CustomerAggregateChildConfig<Row extends object, Key extends string | number> {
  /** 子模块自己的稳定身份；父模型实际归属以主 config 的 modelKey 为准。 */
  key: "contacts" | "addresses";
  /** 子表中文标题，用于表单分区和详情页签。 */
  title: string;
  /** 子行唯一字段数组，供行编辑、表格和校验复用。 */
  fields: readonly FieldDefinition<Row, undefined>[];
  /** 子行草稿保存白名单；不把不需要恢复的字段写入本机。 */
  draft: {
    /** 草稿结构版本，字段结构不兼容时递增。 */
    version: number;
    /** 允许本机持久化的行属性名；例如 name、phone，不保存组件实例。 */
    fields: readonly Extract<keyof Row, string>[];
  };
  /** 提取稳定行 ID，不能使用数组下标。 */
  getRowKey: (row: Readonly<Row>) => Key;
  /** 根据已有行返回全新默认行；例如第一条联系人默认 primary:true。 */
  createInitialRow: (rows: readonly Row[]) => Row;
  /** inline 行内编辑，dialog 弹窗，drawer 抽屉；复杂地址建议 drawer。 */
  editPresentation: "inline" | "dialog" | "drawer";
  /** dialog 的标题/宽度/栅格；非弹窗模式可省略。 */
  editDialog?: TableEdit<Row, undefined>["dialog"];
  /** drawer 的标题/宽度/栅格；非抽屉模式可省略。 */
  editDrawer?: TableEdit<Row, undefined>["drawer"];
  /** 行改变后的归一化，返回新数组；客户用于保持唯一主要项，不能修改输入数组。 */
  normalizeRows: (rows: readonly Row[], change?: CrudChildTableChange<Row, Key>) => Row[];
  /** 多行业务规则：成功返回 []，失败返回具体原因；单字段必填交给 fields。 */
  validateRows: (rows: readonly Row[]) => readonly string[];
  /** 子表专属动作，与主模块 CRUD 行命令无关。 */
  actions: {
    /** 指定唯一主要项并返回新数组；key 为目标行 ID，非数组位置。 */
    setPrimary: (rows: readonly Row[], key: Key) => Row[];
  };
  /** 子表持久化规则；目前只参与主表一次整单提交。 */
  persistence: {
    /** 固定 aggregate，不代表有独立子表端点。 */
    mode: "aggregate";
    /** 子行 → 提交白名单，负责 trim 和剔除 UI 属性；空数组正常返回 []。 */
    toPayload: (rows: readonly Row[]) => Row[];
  };
}

/** 运行时诊断补足动态 key/字段无法由 TypeScript 覆盖的边界。 */
export function defineCustomerChildConfig<Row extends object, Key extends string | number>(
  config: CustomerAggregateChildConfig<Row, Key>
) {
  if (!config.key.trim() || !config.title.trim()) throw new Error("客户子模块 key 与标题不能为空");
  const fieldKeys = config.fields.map((field) => field.key);
  if (!fieldKeys.length || new Set(fieldKeys).size !== fieldKeys.length)
    throw new Error(`${config.key}：字段为空或重复`);
  if (config.persistence.mode !== "aggregate")
    throw new Error(`${config.key}：当前仅支持 aggregate 整单持久化`);
  return config;
}
