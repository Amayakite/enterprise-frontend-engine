import { crudFormActivity } from "./form-state";
import type { CrudViewEnvironment } from "./crud-page";
import type { FormChange, FieldDefinition, FieldDensity, FieldLink } from "../fields/types";
import type { CrudFormController, CrudDetailController } from "./types";
import type { CrudLayoutOptions, CrudDetailSummary } from "./layout";

/** MyCrudForm 及其字段、按钮、错误提示组件使用的参数；完整表单通常直接传 bindings.form。 */
export type CrudFormProps<Model extends object, Entity, Id extends string | number, C> = {
  /** 跨模块新增/详情容器；标准组合自动提供，省略时不创建容器。 */
  host?: CrudViewEnvironment["host"];
  /** 内容布局；省略保持原顶部操作栏。新预设将操作放到底部，复用同一控制器。 */
  layout?: CrudLayoutOptions;
  /** 模块实体名，用于生成新增/编辑标题；省略不追加实体名。 */
  entityLabel?: string;
  /**
   * useCrudForm 创建的表单数据和操作方法，负责加载、保存、草稿与未保存确认。
   * 使用 useCrudView 时已经包含在 bindings.form 中，不需要自己构造。
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
   * 要编辑的字段配置，包含字段名、标签、输入类型及 form 校验规则；未开启 form 的字段不显示。
   * @example
   * `<MyCrudForm :fields="config.fields" ... />`
   */
  fields: readonly FieldDefinition<Model, C>[];
  /**
   * 当前组织、权限等额外信息，供字段条件和联动使用；字段不依赖额外信息时传 undefined。
   * @example
   * `<MyCrudForm :context="pageContext" ... />`
   */
  context: C;
  /**
   * 表单分区定义；每个分区通过同名 section 插槽组合。
   * @example
   * `<MyCrudForm :sections="[{ key: 'contact', label: '联系人' }]" ... />`
   */
  sections?: readonly {
    /** 分区稳定键，对应 section 插槽。 */
    key: string;
    /** 分区标题。 */
    label: string;
  }[];
  /** 调用方强制只读时显示给用户的原因。 */
  readonlyReason?: string;
  /** 当前实体稳定标识，用于草稿等局部状态隔离。 */
  entityKey?: string | number;
  /** 字段间联动规则。 */
  links?: readonly FieldLink<Model, C>[];
  /** 大屏表单列数。 */
  columns?: 1 | 2 | 3;
  /** 表单字段留白；省略跟随全局密度，compact/comfortable 仅覆盖本表单。 */
  density?: FieldDensity;
};

/**
 * 读取模型回写限制，供子表确认输入使用；不把 committing/validating 当作禁止内部回写。
 * @param controller 原表单控制器，权限、草稿和流程状态均从这里读取。
 * @param reason 页面额外的只读原因，省略则采用控制器说明。
 * @returns undefined 表示允许内部编辑；外部控件仍须使用 busy 限制用户操作。
 */
export function crudFormEditReason<M, E, I extends string | number>(
  controller: CrudFormController<M, E, I>,
  reason?: string
): string | undefined {
  if (!controller.savePermission) return "无保存权限";
  if (reason || controller.readonlyReason) return reason || controller.readonlyReason;
  if (["checking", "available", "conflict", "unsafe"].includes(controller.draft?.state.phase ?? ""))
    return "请先处理本机草稿";
  const activity = crudFormActivity(controller.state);
  return activity.canPatch ? undefined : activity.saveDisabledReason;
}

/**
 * 读取原控制器的保存禁用原因，不创建状态副本；供按钮、快捷键和页面状态共同使用。
 * @param controller 当前表单控制器。
 * @param reason 可选弹窗容器只读原因，覆盖控制器只读文案。
 * @param changes 可选字段联动状态；失败或进行中仅阻止保存，不阻止用户继续修改。
 * @returns 给用户显示的原因；保存仍执行控制器内的权限、校验及并发保护。
 */
export function crudFormDisabledReason<M, E, I extends string | number>(
  controller: CrudFormController<M, E, I>,
  reason?: string,
  changes?: {
    /** 字段联动正在等待异步结果，默认 false。 */
    changePending?: boolean;
    /** 最近联动的错误；省略或 null 表示没有错误。 */
    changeError?: string | null;
  }
): string | undefined {
  if (changes?.changeError) return changes.changeError;
  if (changes?.changePending) return "字段变化处理中";
  if (controller.busy) return "正在处理，请稍后";
  const editReason = crudFormEditReason(controller, reason);
  if (editReason) return editReason;
  if (controller.childrenReady === false) return "子表正在准备";
  return crudFormActivity(controller.state).saveDisabledReason;
}

/** MyCrudDetail、详情工具栏和错误提示组件使用的参数；通常通过 bindings.detail 传入。 */
export type CrudDetailProps<Model extends object, Entity, Id extends string | number, C> = {
  /** 默认编辑命令；省略无默认编辑按钮，调用仍须经过原控制器权限保护。 */
  edit?: () => Promise<void>;
  /** 是否展示默认编辑入口，默认 false；页面 actions 插槽可替换该入口。 */
  canEdit?: boolean;
  /** 编辑禁用原因；省略表示不额外限制。 */
  editReason?: string;
  /** 内容布局；省略保持原主信息页签，simple 限宽，structured 展开主资料。 */
  layout?: CrudLayoutOptions;
  /** 无摘要或摘要标题为空时的实体名；省略显示“详情”。 */
  entityLabel?: string;
  /** 详情摘要字段；省略不提取摘要，已展示字段不在资料区重复。 */
  summary?: CrudDetailSummary<Model>;
  /**
   * useCrudDetail 创建的详情数据和操作方法，负责读取记录、刷新和执行按钮操作。
   * 使用 useCrudView 时已经包含在 bindings.detail 中，不需要自己构造。
   * @example
   * `<MyCrudDetail :controller="detailController" ... />`
   * */
  controller: CrudDetailController<Model, Entity, Id>;
  /**
   * 详情中要显示的字段配置；字段需开启 detail，可设置标签、分组和格式化方式。
   * @example
   * `<MyCrudDetail :fields="config.fields" ... />`
   */
  fields: readonly FieldDefinition<Model, C>[];
  /**
   * 当前组织、权限等额外信息，供字段格式化和插槽使用；不需要时传 undefined。
   * @example
   * `<MyCrudDetail :context="pageContext" ... />`
   */
  context: C;
  /**
   * 详情下方的附加页签。例如 key 为 history 时，在 tab-history 插槽放历史记录内容；省略不添加页签。
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
  /** 详情字段留白；省略跟随全局密度，compact/comfortable 仅覆盖本详情。 */
  density?: FieldDensity;
};
