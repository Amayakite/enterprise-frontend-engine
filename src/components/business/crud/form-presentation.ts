import type { FormChange, FieldDefinition, FieldDensity, FieldLink } from "../fields/types";
import type { CrudFormController, CrudDetailController } from "./types";

/** 完整表单及其拆分组件共用的唯一 props 合同；子组件通过 Pick 选取所需部分。 */
export type CrudFormProps<Model extends object, Entity, Id extends string | number, C> = {
  /**
   * 表单加载、保存、草稿和离开保护的控制器。
   * @example
   * `<MyCrudForm :controller="formController" ... />`
   */
  controller: CrudFormController<Model, Entity, Id>;
  /** 用户确认后通知，回填及同步 links 已完成；省略不追踪字段事务。 */ change?: (
    event: FormChange<Model>
  ) => void;
  /** 字段异步业务处理中，默认 false；只限制保存，不锁定继续输入。 */ changePending?: boolean;
  /** 字段异步处理失败文案；null/省略不显示。 */ changeError?: string | null;
  /** 重试失败字段处理，不重新保存；省略不显示重试按钮。 */ retryChange?: () => Promise<void>;
  /**
   * 表单字段定义。
   * @example
   * `<MyCrudForm :fields="config.fields" ... />`
   */
  fields: readonly FieldDefinition<Model, C>[];
  /**
   * 字段渲染、联动和保存适配所需的页面上下文。
   * @example
   * `<MyCrudForm :context="pageContext" ... />`
   */
  context: C;
  /**
   * 表单分区定义；每个分区通过同名 section 插槽装配。
   * @example
   * `<MyCrudForm :sections="[{ key: 'contact', label: '联系人' }]" ... />`
   */
  sections?: readonly {
    /** 分区稳定键，对应 section 插槽。 */
    key: string;
    /** 分区标题。 */
    label: string;
  }[];
  /** 宿主强制只读时显示给用户的原因。 */
  readonlyReason?: string;
  /** 当前实体稳定标识，用于草稿等局部状态隔离。 */
  entityKey?: string | number;
  /** 字段间联动规则。 */
  links?: readonly FieldLink<Model, C>[];
  /** 大屏表单列数。 */
  columns?: 1 | 2 | 3;
  /** 表单显示密度。 */
  density?: FieldDensity;
};

/**
 * 读取原控制器的交互禁用原因，不创建状态副本；undefined 表示可以开始编辑/校验。
 * @param controller 当前表单控制器。
 * @param reason 可选宿主只读原因，覆盖控制器只读文案。
 * @returns 给用户显示的原因；保存仍执行控制器内的权限、校验及并发保护。
 */
export function crudFormDisabledReason<M, E, I extends string | number>(
  controller: CrudFormController<M, E, I>,
  reason?: string
): string | undefined {
  if (controller.busy) return "正在处理，请稍后";
  if (!controller.savePermission) return "无保存权限";
  if (reason || controller.readonlyReason) return reason || controller.readonlyReason;
  if (controller.childrenReady === false) return "子表正在准备";
  if (["checking", "available", "conflict", "unsafe"].includes(controller.draft?.state.phase ?? ""))
    return "请先处理本机草稿";
  if (controller.state.phase === "load-error") return "请先重新加载";
  if (controller.state.phase === "committed-needs-sync") return "保存已提交，请先回填";
  if (controller.state.mutationOutcome === "unknown") return "提交结果待核实";
}

/** 标准详情及拆分呈现组件共用合同，复用原详情控制器。 */
export type CrudDetailProps<Model extends object, Entity, Id extends string | number, C> = {
  /**
   * 详情加载与业务动作的控制器。
   * @example
   * `<MyCrudDetail :controller="detailController" ... />`
   * */
  controller: CrudDetailController<Model, Entity, Id>;
  /**
   * 主详情区域使用的字段定义。
   * @example
   * `<MyCrudDetail :fields="config.fields" ... />`
   */
  fields: readonly FieldDefinition<Model, C>[];
  /**
   * 字段格式化与详情插槽所需的页面上下文。
   * @example
   * `<MyCrudDetail :context="pageContext" ... />`
   */
  context: C;
  /**
   * 附加详情页签；通过对应 tab 插槽装配内容。
   * @example
   * `<MyCrudDetail :tabs="[{ key: 'history', label: '历史' }]" ... />`
   */
  tabs?: readonly {
    /** 页签键。 */
    key: string;
    /** 页签标题。 */
    label: string;
  }[];
  /**
   * 详情页顶部可执行的业务动作。
   * @example
   * `<MyCrudDetail :actions="config.actions" ... />`
   */
  actions?: readonly {
    /** 动作键。 */
    key: string;
    /** 按钮文字。 */
    label: string;
    /** 按钮语气，默认常规。 */ tone?: "primary" | "danger" | "default";
  }[];
  /**
   * 返回列表或上一级的导航操作。
   * @example
   * `<MyCrudDetail :back="() => router.push('/customer')" ... />`
   */
  back?: () => Promise<void>;
  /** 大屏详情列数。 */
  columns?: 1 | 2 | 3;
  /** 详情描述列表的显示密度。 */
  density?: FieldDensity;
};
