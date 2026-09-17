import type { Component, DeepReadonly } from "vue";
import type { BatchRequest, BatchResult } from "@/api/common/batch";

/** config 仅维护模块批量标识，不存具体动作规则。 */
export interface BatchIdentity<Row> {
  /**
   * 默认 batchID；编码接口改为 batchCode，并同时指定 getValue。
   * @example
   * `batch: { field: "batchCode", getValue: row => row.customerCode }`
   */
  field?: "batchID" | "batchCode";
  /** 默认使用列表 getKey；batchCode 必须提供编码读取，不能把 ID 冒充编码。 */
  getValue?: (row: DeepReadonly<Row>) => string | number;
}
/** index 声明的一项批量命令；确认/单飞/反馈由公共 hook 负责。 */
export interface BatchCommand<Row> {
  /** 后端操作码；同组不能重复，例如 disable。 */
  key: string;
  /** 按钮文案，例如批量禁用。 */
  label: string;
  /** 前端权限码；数组要求全部满足，后端仍需鉴权。 */
  permission?: string | readonly string[];
  /**
   * 按钮图标；省略使用通用操作图标，删除默认使用垃圾桶。
   * @example
   * `{ key: "disable", label: "批量禁用", icon: CircleClose }`
   */
  icon?: Component;
  /** 删除等不可逆操作使用 danger。 */
  tone?: "primary" | "danger" | "default";
  /** 是否允许未勾选时操作当前查询全部结果；默认 false，须主动开启。 */
  allowQuery?: boolean;
  /** 选中记录的业务禁用原因；query 全量状态只能由后端检查。 */
  disabledReason?: (rows: readonly DeepReadonly<Row>[]) => string | undefined;
}
/** UI 读取的批量操作端口；反馈不因关闭轻提示而丢失。 */
export interface BatchController {
  /** 当前按钮及实时禁用原因，页面不读取私有列表实例。 */
  readonly buttons: readonly {
    /** 命令码，传给 run。 */
    key: string;
    /** 按钮文案。 */
    label: string;
    /** 页面声明的操作图标，未提供时由展示组件使用默认图标。 */
    icon?: Component;
    /** 危险写操作使用 danger。 */
    tone?: "primary" | "danger" | "default";
    /** 权限不足时隐藏。 */
    visible: boolean;
    /** 禁用原因；省略表示可执行。 */
    reason?: string;
  }[];
  /** 当前操作范围的人类可读说明。 */
  readonly scopeLabel: string;
  /** 确认/请求/刷新期间锁定操作。 */
  readonly busy: boolean;
  /** 最近错误；网络结果未知时提示先核实，禁止自动重试。 */
  readonly error: string | null;
  /** 最近反馈，含成功/失败数量和有限明细。 */
  readonly result: BatchResult | null;
  /**
   * 执行某个按钮，先确认范围，参数快照改变时不执行。
   * @param key commands 中的操作码。
   * @returns 完成反馈/刷新后的 Promise，错误由 error 提供给 UI。
   * @example
   * `await batch.run("disable");`
   */
  run: (key: string) => Promise<void>;
}
/** 批量 API 适配器；index 可传公共请求或模块专属实现。 */
export type BatchExecutor<Query> = (
  request: BatchRequest<Query>,
  signal: AbortSignal
) => Promise<BatchResult>;
