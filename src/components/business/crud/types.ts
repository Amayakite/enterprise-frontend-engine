import type { CrudDetailSummary } from "./layout";
import type { Component, DeepReadonly, VNodeChild } from "vue";
import type { PageResult } from "@/types/http";
import type { FieldDefinition, FieldKey } from "@/components/business/fields/types";
import type { TableColumn, TableSort } from "@/components/table/types";
import type {
  AppliedQuery,
  QueryDraft,
  QueryEnvelope,
  QuerySchema,
  QueryScope,
} from "@/components/business/search/types";

/** CRUD 装配公开合同，业务 DTO 及状态规则仍归模块配置。 */
export interface CrudRequestContext<C> {
  /** 页面卸载或请求取消时中止等待；需透传 API，不代表服务端事务回滚。 */
  signal: AbortSignal;
  /** 只读页面上下文，例如组织和 scopeKey；不在请求回调中修改。 */
  context: DeepReadonly<C>;
}
/** 列表请求合同；固定 scope、用户 where、分页与排序分开传递，不直接拼接接口参数。 */
export interface CrudListRequest<Row, S extends QuerySchema, Scope> extends QueryEnvelope<
  S,
  Scope
> {
  /** 当前页码，从 1 开始。 */
  pageNum: number;
  /** 每页条数；通常 10/20/50/100。 */
  pageSize: number;
  /** 当前排序；null 表示无用户排序，API 仍须校验白名单。 */
  sort: TableSort<Row> | null;
}
/** 表单目标判别联合：新增无 ID，编辑必须指定 ID；目标属于当前页面实例。 */
export type CrudTarget<Id extends string | number> =
  | {
      /**
       * 场景判别值：add 表示新建无 ID，edit 表示已有实体；按所在分支填写字面量。
       */
      mode: "add";
    }
  | {
      /**
       * 场景判别值：add 表示新建无 ID，edit 表示已有实体；按所在分支填写字面量。
       */
      mode: "edit";
      /**
       * 稳定标识；保留声明的 string/number 类型，不使用数组下标。null 表示尚未加载。
       */
      id: Id;
    };
/** 生命周期守卫结果；正常业务拦截返回 proceed:false 与原因，不用异常替代。 */
export type CrudGuardResult =
  | {
      /**
       * 是否允许继续当前流程；false 时必须提供可展示的 reason，不用抛异常表示正常拦截。
       */
      proceed: true;
    }
  | {
      /**
       * 是否允许继续当前流程；false 时必须提供可展示的 reason，不用抛异常表示正常拦截。
       */
      proceed: false;
      /**
       * 面向用户的原因说明；允许操作时省略，拦截时说明如何解除限制。
       */
      reason: string;
    };
/** 可定位的主表/子表校验错误；主字段用 field，子行列用 rowField。 */
export interface CrudIssue<M> {
  /**
   * 错误所在表单分区 key；与 sections/子表注册 key 对应，省略表示主表。
   */
  section?: string;

  /**
   * 稳定行主键；必须与表格 getKey 一致，用于定位而不是行号。
   */
  rowKey?: string | number;

  /**
   * 模型字段名；从类型提示选择实际存在的 key，用于配置/错误定位。
   */
  field?: FieldKey<M>;
  /** 子行列名由注册模块校验，不作为主模型字段。 */
  rowField?: string;

  /**
   * 面向用户的结果或错误说明；填写可理解的业务原因，避免原始堆栈。
   */
  message: string;
}
/** 表单校验结果；成功无错误数组，失败包含 issues。 */
export type CrudValidation<M> =
  | {
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: true;
    }
  | {
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: false;
      /**
       * 校验失败明细；包含定位信息与提示文案，成功分支不需要填写。
       */
      issues: readonly CrudIssue<M>[];
    };

/** S2 已并入字段所有者；保留 S1 类型名称供配置兼容。 */
export type CrudField<M, C> = FieldDefinition<M, C>;
/** 从统一字段合同提取 select 分支；选项值仍受模型字段类型约束。 */
export type CrudOptionField<M, C = undefined> = Extract<
  FieldDefinition<M, C>,
  {
    /**
     * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
     */
    type: "select";
  }
>;

/** 工具栏动作执行上下文；包含只读选择快照、业务范围和取消信号。 */
export interface CrudActionContext<
  Row,
  Id extends string | number,
  C,
> extends CrudRequestContext<C> {
  /** 工具栏选中的行快照；行操作中仍可读取，不能直接改原始列表。 */
  selectedRows: readonly DeepReadonly<Row>[];
  /** 与选中行对应的稳定 ID；没有勾选时为空数组。 */
  selectedKeys: readonly Id[];
}
/** 行动作执行上下文；在公共动作环境上增加当前 row 与 rowKey。 */
export interface CrudRowActionContext<Row, Id extends string | number, C> extends CrudActionContext<
  Row,
  Id,
  C
> {
  /** 当前被操作的行快照，包含业务状态与版本。 */
  row: DeepReadonly<Row>;
  /** 当前操作对象的稳定 ID，0 也有效；不要用数组位置代替。 */
  rowKey: Id;
}
/** 动作成功/部分失败回执；用于公共刷新和反馈，不等于整单事务成功。 */
export interface CrudActionResult<Id extends string | number> {
  /** 本次成功影响的 ID；批量部分失败时只列成功项。 */
  affectedKeys: readonly Id[];
  /** 批量部分失败列表；提供每个失败 ID 和业务原因，省略表示无逐项失败。 */
  failed?: readonly {
    /**
     * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
     */
    key: Id;
    /**
     * 面向用户的结果或错误说明；填写可理解的业务原因，避免原始堆栈。
     */
    message: string;
  }[];
  /** 动作结果摘要；省略不提供摘要文案。 */
  message?: string;
}
/**
 * 工具栏/行操作的公共配置；由 useCrudActions 执行，不在页面重复维护 loading。
 * @typeParam Context 行操作含 row/rowKey，工具栏操作含 selectedRows/selectedKeys。
 * @typeParam Id 后端 ID 类型，成功回执必须保持该类型。
 */
export interface ActionOptions<Context, Id extends string | number> {
  /**
   * 动作唯一标识，模块同一动作列表内不能重复；用于单飞与执行定位。
   * @example
   * `key: "approve"`
   */
  key: string;
  /**
   * 按钮中文文案，不是接口动作码。普通动作直接在此填写，无需另建 label 字典。
   * @example
   * `label: "审核"`
   */
  label: string;
  /**
   * 可选 Vue 图标组件；省略显示纯文字。
   * @example
   * `icon: Delete`
   */
  icon?: Component;
  /**
   * 按钮语义色；推荐危险写操作用 danger，普通操作省略（default）。
   * @example
   * `tone: "danger"`
   */
  tone?: "primary" | "danger" | "default";
  /**
   * 按钮权限码；数组要求全部满足，未提供不加此项限制，无权限时隐藏。
   * @remarks 前端可见性不替代后端鉴权；权限在执行前再次检查。
   * @example
   * `permission: "base:customer:approve"`
   */
  permission?: string | readonly string[];
  /**
   * 是否显示；省略为 true。适合业务状态判断，不在此发请求或修改模型。
   * @example
   * `visible: ({ row }) => row.status === "pending"`
   */
  visible?: (context: Context) => boolean;
  /**
   * 返回禁用原因仍显示按钮；undefined 表示业务上允许，加载/忙碌锁仍可能禁用。
   * @example
   * `disabledReason: ({ row }) => row.locked ? "已锁定" : undefined`
   */
  disabledReason?: (context: Context) => string | undefined;
  /**
   * 执行前的确认标题与内容；低层 CrudAction 省略时不弹确认。
   * @remarks 用户取消不是错误，不执行 execute。行命令工厂另有默认确认。
   * @example
   * `confirm: ({ row }) => ({ title: "删除客户", message: \`确定删除「\${row.name}」吗？\` })`
   */
  confirm?: (context: Context) => {
    /** 弹窗标题，例如“删除客户”。 */
    title: string;
    /** 具体风险与对象说明；普通文本，不传 HTML。 */
    message: string;
  };
  /**
   * 实际操作，必须返回受影响 ID；异常向外抛出，由公共执行器显示。
   * @remarks 透传 context.signal；不吞失败，不自行重试写请求。
   * @example
   * `execute: async ({ rowKey, signal }) => { await API.remove(rowKey, signal); return { affectedKeys: [rowKey] }; }`
   */
  execute: (context: Context) => Promise<CrudActionResult<Id>>;
  /**
   * 写入成功后的导航等副作用，发生在自动刷新之前；省略不额外处理。
   * @remarks 这里失败只报告“后续处理失败”，不会重新执行写入。
   * @example
   * `afterExecute: async () => { await navigation.close?.(); }`
   */
  afterExecute?: (result: CrudActionResult<Id>, context: Context) => Promise<void>;
  /**
   * 成功后的刷新策略；省略刷新当前页，first-page 回第一页，none 不自动刷新。
   * @example
   * `refresh: "none"` // 删除详情记录后关闭页面，不再回读已删除实体。
   */
  refresh?: "none" | "current-page" | "first-page";
}
/** 工具栏与行动作联合；location 决定回调能使用的上下文。 */
export type CrudAction<Row, Id extends string | number, C> =
  | ({
      /** 工具栏按钮，回调使用选中行集合。 */
      /**
       * 动作位置判别值；row 接收当前行，toolbar 接收工具栏选择集合。
       */
      location: "toolbar";
    } & ActionOptions<CrudActionContext<Row, Id, C>, Id>)
  | ({
      /** 行内按钮，回调可读取当前 row/rowKey。 */
      /**
       * 动作位置判别值；row 接收当前行，toolbar 接收工具栏选择集合。
       */
      location: "row";
    } & ActionOptions<CrudRowActionContext<Row, Id, C>, Id>);

/** CRUD 表格列合同；与 MyTable 列定义复用，保留行字段类型。 */
export interface CrudColumn<Row> extends TableColumn<Row> {
  /** 必须同时提供对应 navigation，未绑定时退为普通文本。 */
  link?: "detail" | "edit";
  /** 次行展示字段，例如 customerCode；省略保持单行。 */
  secondary?: FieldKey<Row>;
}

/**
 * 列表页的模块配置：查询 schema、列、请求适配、选择和动作。
 *
 * @typeParam Row 列表行类型。
 * @typeParam Id 行稳定主键。
 * @typeParam S 结构化查询 schema。
 * @remarks toQuery 是 UI 查询模型到业务 API DTO 的唯一适配边界；不要在页面直接拼 API 参数。
 */
export interface CrudListConfig<
  Row,
  Id extends string | number,
  S extends QuerySchema,
  Scope,
  QueryDTO,
  C,
> {
  /**
   * 从列表行提取稳定主键；不能使用数组索引。
   * @example
   * `getKey: (row) => row.id`
   */
  getKey: (row: Readonly<Row>) => Id;
  /** 列表列配置；字段列需要与 fields 中同名 key 对应。 */
  columns: readonly CrudColumn<Row>[];
  /** 可选字段合同，用于列表单元格格式化或行内编辑。 */
  fields?: readonly CrudField<Row, C>[];
  /** 查询 schema 与已应用初始条件。 */
  query: {
    /** 后端查询白名单与 UI 输入合同；不要传未经验证的任意字段。 */
    schema: S;
    /** 初始已应用条件；通常 emptyAppliedQuery<typeof schema>()。 */
    initial: AppliedQuery<S>;
  };
  /** 返回当前组织/权限等固定范围；key 变化会使列表重置。 */
  scope: (context: DeepReadonly<C>) => QueryScope<Scope>;
  /** 将公共 CRUD 查询模型适配为业务 API DTO。 */
  toQuery: (request: CrudListRequest<Row, S, Scope>, context: DeepReadonly<C>) => QueryDTO;
  /** 请求列表数据；应透传 context.signal。 */
  request: (query: QueryDTO, context: CrudRequestContext<C>) => Promise<PageResult<Row>>;
  /** 查询前守卫；只读 DTO 不得改变固定范围，拒绝时保留旧结果。 */
  beforeQuery?: (
    query: DeepReadonly<QueryDTO>,
    request: CrudRequestContext<C>
  ) => Promise<CrudGuardResult>;
  /** 当前有效查询成功后执行；输入只读，不修改服务端数据。 */
  afterQuery?: (
    result: DeepReadonly<PageResult<Row>>,
    request: CrudRequestContext<C>
  ) => Promise<void>;
  /** 默认每页条数，推荐 10/20/50/100，省略时为 20。 */
  pageSize?: number;
  /** 初始排序；字段必须是后端允许排序的字段。 */
  initialSort?: TableSort<Row>;
  /** 是否启用行选择，默认 none。 */
  selection?: "none" | "single" | "multiple";
  /** 工具栏或行级动作配置。 */
  actions?: readonly CrudAction<Row, Id, C>[];
  /** 内置编辑入口的业务禁用原因；省略时保持原有始终可编辑行为。 */
  editDisabledReason?: (row: Readonly<Row>, context: Readonly<C>) => string | undefined;
}
/** 保存转换输入；包含本次模型快照、目标和服务端基线，不允许修改原始基线。 */
export interface CrudSaveInput<
  Model,
  Entity,
  Id extends string | number,
  C,
> extends CrudRequestContext<C> {
  /** 当前新增或编辑目标；编辑目标带当前实例的 ID。 */
  target: CrudTarget<Id>;
  /** 已提交活动子行后的只读表单快照；转换时不要污染原模型。 */
  model: DeepReadonly<Model>;
  /** 服务端载入基线；新增为 null，编辑态用于版本比较与并发控制。 */
  baseline: DeepReadonly<Entity> | null;
}
/**
 * 新增/编辑页的模块配置：实体加载、模型转换、保存 DTO 与草稿策略。
 *
 * @remarks DTO 始终归 API 模块；toModel/toCreate/toUpdate 显式完成模型转换。草稿配置只保存字段白名单，
 * 子表草稿必须在各自子表 config 中声明。
 */
export interface CrudFormConfig<
  Model,
  Entity,
  Id extends string | number,
  CreateDTO,
  UpdateDTO,
  SaveResult,
  C,
> {
  /** 本机草稿配置；未提供则不启用草稿。 */
  draft?: import("@/composables/useCrudDraft").CrudDraftConfig<Model, Entity>;
  /** 标准保存反馈；省略使用全局“保存成功”，不要在 afterSave 中重复弹提示。 */
  feedback?: {
    /** 保存并回填成功时的轻提示文案；false 关闭轻提示，错误保护仍保留。
     * @example
     * `feedback: { saved: "客户资料已保存" }`
     */
    saved?: string | false;
  };
  /** 新增/编辑操作所需权限；数组按全部满足判断。 */
  permissions?: {
    /** 新增权限，数组全部满足；省略不限制此项。示例 base:customer:create。 */
    create?: string | readonly string[];
    /** 编辑权限，数组全部满足；省略不限制此项。示例 base:customer:update。 */
    update?: string | readonly string[];
  };
  /** 表单字段配置；同一字段不要在多个文件重复定义。 */
  fields: readonly CrudField<Model, C>[];
  /** 表单分区；子表分区仍需在 children/<name>/config.ts 声明。 */
  sections?: readonly {
    /**
     * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
     */
    key: string;
    /**
     * 面向用户的中文显示文案；不用于接口值或缓存身份。
     * @example
     * `label: "客户名称"`
     */
    label: string;
  }[];
  /** 已注册子模块对应的主模型字段 key。 */
  childKeys?: readonly FieldKey<Model>[];
  /** 返回实体只读原因；有值时禁止保存。 */
  readonlyReason?: (model: DeepReadonly<Model>, context: DeepReadonly<C>) => string | undefined;
  /** 只有业务适配确认服务端拒绝写入时才返回 rejected；网络未知保持 unknown。 */
  classifySaveError?: (cause: unknown) => "rejected" | "unknown";
  /** 返回全量初始模型；不要复用可变单例对象。 */
  createInitial: (context: DeepReadonly<C>) => Model;
  /** 初始化准备；可返回新增初值补丁，编辑禁止补丁，取消后不应用。 */
  beforeOpen?: (
    input: CrudRequestContext<C> & {
      /** 当前实例目标。 */ target: CrudTarget<Id>;
    }
  ) => Promise<Partial<Model> | void>;
  /** 初始化及草稿选择完成后执行；只读数据，失败进入可重试加载错误。 */
  afterOpen?: (input: CrudSaveInput<Model, Entity, Id, C>) => Promise<void>;
  /** 根据 ID 读取服务端实体；应透传 context.signal。 */
  load: (id: Id, context: CrudRequestContext<C>) => Promise<Entity>;
  /** 将 API Entity 转为页面 Model；日期/金额等可在此显式适配。 */
  toModel: (entity: Entity, context: DeepReadonly<C>) => Model;
  /** 额外跨字段/跨子表校验；普通字段规则无需重复填写。失败返回带字段或分区定位的 issues。 */
  validate?: (input: CrudSaveInput<Model, Entity, Id, C>) => Promise<CrudValidation<Model>>;
  /** 写入前业务守卫；返回 proceed:false 和 reason 阻止本次保存，省略直接继续。 */
  beforeSave?: (input: CrudSaveInput<Model, Entity, Id, C>) => Promise<CrudGuardResult>;
  /** 新增时将页面模型转换为 CreateDTO。 */
  toCreate: (
    input: CrudSaveInput<Model, Entity, Id, C> & {
      /**
       * 本次新增/编辑目标；新增不传 ID，编辑必须传真实实体 ID。
       * @example
       * `target: { mode: "edit", id: "C001" }`
       */
      target: {
        /**
         * 场景判别值：add 表示新建无 ID，edit 表示已有实体；按所在分支填写字面量。
         */
        mode: "add";
      };
      /**
       * 服务端加载/保存后的只读基线；新增时为 null，编辑时用于版本和差异比较，不直接修改。
       */
      baseline: null;
    }
  ) => CreateDTO;
  /** 编辑时将页面模型和基线实体转换为 UpdateDTO。 */
  toUpdate: (
    input: CrudSaveInput<Model, Entity, Id, C> & {
      /**
       * 本次新增/编辑目标；新增不传 ID，编辑必须传真实实体 ID。
       * @example
       * `target: { mode: "edit", id: "C001" }`
       */
      target: {
        /**
         * 场景判别值：add 表示新建无 ID，edit 表示已有实体；按所在分支填写字面量。
         */
        mode: "edit";
        /**
         * 稳定标识；保留声明的 string/number 类型，不使用数组下标。null 表示尚未加载。
         */
        id: Id;
      };

      /**
       * 服务端加载/保存后的只读基线；新增时为 null，编辑时用于版本和差异比较，不直接修改。
       */
      baseline: DeepReadonly<Entity>;
    }
  ) => UpdateDTO;
  /** 提交新增 DTO。 */
  create: (dto: CreateDTO, context: CrudRequestContext<C>) => Promise<SaveResult>;
  /** 提交编辑 DTO。 */
  update: (id: Id, dto: UpdateDTO, context: CrudRequestContext<C>) => Promise<SaveResult>;
  /** 写入已提交后才调用；费用回执需再读详情，失败只重试回填。 */
  resolveSaved: (result: SaveResult, input: CrudSaveInput<Model, Entity, Id, C>) => Promise<Entity>;

  /**
   * 从实体提取稳定主键；保持后端 ID 类型，数字 0 也有效。
   * @example
   * `getKey: row => row.id`
   */
  getKey: (entity: Readonly<Entity>) => Id;
  /** 写入并回填成功后的业务副作用；不要再次保存或重复弹成功提示，文案用 feedback.saved。 */
  afterSave?: (entity: DeepReadonly<Entity>, context: CrudRequestContext<C>) => Promise<void>;
  /** 关闭前业务守卫；公共脏状态检查仍生效，省略不增加额外关闭条件。 */
  beforeClose?: (
    state: {
      /**
       * 是否存在尚未保存的修改；由控制器比较基线/子表草稿得出，不手工赋值。
       */
      dirty: boolean;
      /**
       * 本次新增/编辑目标；新增不传 ID，编辑必须传真实实体 ID。
       * @example
       * `target: { mode: "edit", id: "C001" }`
       */
      target: CrudTarget<Id>;
    },
    context: CrudRequestContext<C>
  ) => Promise<CrudGuardResult>;
}
/** 详情页的加载、模型转换、字段、页签与动作配置。 */
export interface CrudDetailConfig<Entity, Model, Id extends string | number, C> {
  /** 详情摘要配置；省略不提取，字段键受页面模型约束，隐藏字段不会展示。 */
  summary?: CrudDetailSummary<Model>;
  /** 详情加载前准备；不代替 load，不修改 ID。 */
  beforeOpen?: (id: Id, request: CrudRequestContext<C>) => Promise<void>;
  /** 当前有效详情回显后执行；只读模型，失败进入详情错误态。 */
  afterOpen?: (
    entity: DeepReadonly<Entity>,
    model: DeepReadonly<Model>,
    request: CrudRequestContext<C>
  ) => Promise<void>;
  /** ID → 详情实体；应透传 context.signal，不在这里更新其他页面状态。 */
  load: (id: Id, context: CrudRequestContext<C>) => Promise<Entity>;
  /** 实体 → 只读页面模型，接口字段与展示字段不同则显式转换。 */
  toModel: (entity: Entity, context: DeepReadonly<C>) => Model;
  /** 只读主字段；标准模块由 scenes.detail 派生。 */
  fields: readonly CrudField<Model, C>[];
  /** 额外页签，与 tab-<key> 插槽对应；main 是公共主信息保留键。 */
  tabs?: readonly {
    /**
     * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
     */
    key: string;
    /**
     * 面向用户的中文显示文案；不用于接口值或缓存身份。
     * @example
     * `label: "客户名称"`
     */
    label: string;
  }[];
  /** 详情操作；与列表动作使用同一权限、确认和执行规则。 */
  actions?: readonly CrudAction<Entity, Id, C>[];
}
/** 可替换的页面导航策略；省略的方法不提供对应导航能力，不在组件中硬编码路由。 */
export interface CrudNavigation<Id extends string | number> {
  /** 打开新增路由；未提供则对应导航按钮不可用。 */
  add?: () => Promise<void>;
  /** 按 ID 打开编辑路由；应 encodeURIComponent 路径段。 */
  edit?: (id: Id) => Promise<void>;
  /** 按 ID 打开详情路由；ID 类型与业务 API 保持一致。 */
  detail?: (id: Id) => Promise<void>;
  /** 保存和回填成功后的导航，一般进入新记录详情；不要在此重复保存。 */
  saved?: (id: Id) => Promise<void>;
  /** 关闭当前业务页面的导航；脏状态通过 controller.close 处理。 */
  close?: () => Promise<void>;
}
/**
 * 一个业务模块的统一 CRUD 入口配置。
 *
 * @remarks key 是模块稳定身份，用于缓存、草稿、列偏好和排障；应使用可读路径，例如 `base.customer`。
 * @see defineCrudConfig
 */
export interface CrudConfig<
  Row,
  Entity,
  Model,
  Id extends string | number,
  S extends QuerySchema,
  Scope,
  QueryDTO,
  CreateDTO,
  UpdateDTO,
  SaveResult,
  C,
> {
  /**
   * 可读、稳定的模块 key；用于草稿、列偏好、缓存与排障。
   * @example
   * `key: "base.customer"`
   */
  key: string;
  /** 列表页配置；纯编辑模块可省略。 */
  list?: CrudListConfig<Row, Id, S, Scope, QueryDTO, C>;
  /** 新增/编辑页配置；只读模块可省略。 */
  form?: CrudFormConfig<Model, Entity, Id, CreateDTO, UpdateDTO, SaveResult, C>;
  /** 详情页配置；没有详情页可省略。 */
  detail?: CrudDetailConfig<Entity, Model, Id, C>;
  /** 模块内统一导航行为。 */
  navigation?: CrudNavigation<Id>;
}

/** 表单生命周期状态；区分加载、编辑、保存和提交后回填，避免重复写入。 */
export type CrudFormPhase =
  | "idle"
  | "loading"
  | "ready"
  | "committing"
  | "validating"
  | "saving"
  | "resolving"
  | "saved"
  | "load-error"
  | "save-error"
  | "committed-needs-sync";
/** 列表只读状态；请求/查询/分页与选择均由 useCrudList 管理。 */
export interface CrudListState<Row, Id extends string | number, S extends QuerySchema> {
  /**
   * 当前行集合；控制器返回的是只读快照，修改请调用 replace/patch 等公开方法。
   */
  rows: readonly Row[];

  /**
   * 符合查询条件的总条数，不是当前页 rows.length；填写服务端分页总数。
   */
  total: number;

  /**
   * 当前读取请求是否进行中；用于加载提示和阻止重复操作。
   */
  loading: boolean;

  /**
   * 正在执行的动作 key；null 表示空闲，不能依赖按钮文案判断忙碌。
   */
  busyActionKey: string | null;

  /**
   * 本次失败信息；无错误时为空值。unknown 类型需先判断再读取 message。
   */
  error: string | null;

  /**
   * 页码，从 1 开始；修改分页时通过 setPage 调用。
   * @example
   * `pageNum: 1`
   */
  pageNum: number;

  /**
   * 每页条数，通常 10/20/50/100；接口仍需限制最大值。
   * @example
   * `pageSize: 20`
   */
  pageSize: number;

  /**
   * 排序字段和方向；null 表示不指定用户排序，字段须属于 API 排序白名单。
   * @example
   * `sort: { key: "code", order: "asc" }`
   */
  sort: TableSort<Row> | null;

  /**
   * 当前勾选的稳定 ID 集合；没有选择时为空数组，不能直接修改。
   */
  selectedKeys: readonly Id[];

  /**
   * 已校验并实际用于请求的查询条件；不同于用户尚在编辑的 draft。
   */
  applied: AppliedQuery<S>;

  /**
   * 草稿状态/接口：查询草稿尚未应用，表单草稿由 useCrudDraft 管理；按声明类型使用。
   */
  draft: QueryDraft<S>;
}
/** 公共列表控制器；供 MyCrudList 和页面插槽使用，业务只调用公开命令。 */
export interface CrudListController<Row, Id extends string | number, S extends QuerySchema> {
  /**
   * 控制器只读响应式状态；模板可读取，业务更新必须通过公开方法，不能直接赋值。
   */
  readonly state: DeepReadonly<CrudListState<Row, Id, S>>;

  /**
   * 替换未应用的查询草稿，不立即请求；通常供查询插槽接收编辑结果。
   */
  setDraft: (draft: QueryDraft<S>) => void;

  /**
   * 校验并应用查询草稿，再加载列表；返回 false 表示未成功应用。
   */
  applyQuery: () => Promise<boolean>;

  /**
   * 放弃未应用的查询编辑，恢复已应用条件，不额外写入业务数据。
   */
  cancelQuery: () => void;

  /**
   * 恢复查询初始条件并重新加载；返回 Promise，可等待列表刷新。
   */
  resetQuery: () => Promise<void>;

  /**
   * 重新读取当前数据；复用现有条件/目标，不提交写入操作。
   */
  refresh: () => Promise<void>;

  /**
   * 切换页码/每页条数并请求；页码从 1 开始。
   * @example
   * `await list.setPage(1, 20)`
   */
  setPage: (pageNum: number, pageSize: number) => Promise<void>;

  /**
   * 应用排序并重新查询；清除排序传 null。
   * @example
   * `await list.setSort(null)`
   */
  setSort: (sort: TableSort<Row> | null) => Promise<void>;

  /**
   * 更新勾选 ID；传 [] 清空，只改变选择，不执行批量动作。
   * @example
   * `list.select([])`
   */
  select: (keys: readonly Id[]) => void;

  /**
   * 按配置 key 执行动作，内部处理权限、确认和忙碌；行操作还需 rowKey。
   * @example
   * `await list.runAction("approve", "C001")`
   */
  runAction: (key: string, rowKey?: Id) => Promise<void>;

  /**
   * 读取动作当前可见性和禁用原因；用于展示，执行时控制器仍会重新检查。
   */
  actionAvailability: (
    key: string,
    rowKey?: Id
  ) => {
    /**
     * 是否显示此操作；false 隐藏，禁用但可见应使用 reason。
     */
    visible: boolean;
    /**
     * 面向用户的原因说明；允许操作时省略，拦截时说明如何解除限制。
     */
    reason?: string;
  };

  /**
   * 最近动作回执；null 表示没有回执，批量结果可能包含部分失败。
   */
  readonly actionResult: DeepReadonly<CrudActionResult<Id>> | null;
}
/** 公共表单控制器；统一主子表校验、保存、草稿和离开守卫，每页独立创建。 */
export interface CrudFormController<Model, Entity, Id extends string | number> {
  /**
   * 草稿状态/接口：查询草稿尚未应用，表单草稿由 useCrudDraft 管理；按声明类型使用。
   */
  readonly draft?: import("@/composables/useCrudDraft").CrudDraftController;

  /**
   * 当前存在加载/保存/子表提交等进行中任务；为 true 时不重复触发操作。
   */
  readonly busy: boolean;

  /** 所有必需子表是否已登记；false 时等待异步视图，禁用保存/恢复。兼容旧控制器省略时视为就绪。 */
  readonly childrenReady?: boolean;

  /**
   * 当前只读原因；undefined 表示未因该策略限制编辑，不等于后端授权。
   */
  readonly readonlyReason: string | undefined;

  /**
   * 当前新增/编辑保存权限是否满足；由目标模式选择配置中的权限规则。
   */
  readonly savePermission: boolean;

  /**
   * 控制器只读响应式状态；模板可读取，业务更新必须通过公开方法，不能直接赋值。
   */
  readonly state: DeepReadonly<{
    /**
     * 当前生命周期阶段；依据联合字面量显示加载/失败/就绪界面，不手动变更。
     */
    phase: CrudFormPhase;

    /**
     * 写入结果状态：unknown 表示请求结果未确定，committed 表示已提交；未知时不可盲目重发。
     */
    mutationOutcome: "none" | "pending" | "rejected" | "unknown" | "committed";

    /**
     * 当前页面模型；表单字段与联动使用它，不等同于后端保存 DTO。
     */
    model: Model;

    /**
     * 整体回填版本，从 0 开始；初始化、读取、保存回填、草稿恢复或上下文重置时递增。
     * MyCrudForm 用它更新 MyForm 的 formKey，整体回填不执行字段联动或用户 change。
     * 普通 patch 不递增；宿主只读，不自行修改。
     * @example
     * controller.state.hydrationRevision
     */
    hydrationRevision: number;

    /**
     * 服务端加载/保存后的只读基线；新增时为 null，编辑时用于版本和差异比较，不直接修改。
     */
    baseline: Entity | null;

    /**
     * 本次新增/编辑目标；新增不传 ID，编辑必须传真实实体 ID。
     * @example
     * `target: { mode: "edit", id: "C001" }`
     */
    target: CrudTarget<Id>;

    /**
     * 是否存在尚未保存的修改；由控制器比较基线/子表草稿得出，不手工赋值。
     */
    dirty: boolean;

    /**
     * 校验失败明细；包含定位信息与提示文案，成功分支不需要填写。
     */
    issues: readonly CrudIssue<Model>[];

    /**
     * 本次失败信息；无错误时为空值。unknown 类型需先判断再读取 message。
     */
    error: string | null;
  }>;

  /**
   * 合并主模型部分字段，保留其他字段；不绕过保存时的校验。
   * @example
   * `controller.patch({ customerName: "新名称" })`
   */
  patch: (patch: Partial<Model>) => void;

  /**
   * 校验主子表并执行当前场景保存；控制器统一处理忙碌、回填和失效通知。
   */
  save: () => Promise<void>;

  /**
   * 仅重试已提交后的回读/同步；不会再次执行 create/update，避免重复写入。
   */
  retrySync: () => Promise<void>;

  /**
   * 请求关闭当前编辑页；有未保存修改时走离开守卫，返回是否允许关闭。
   */
  close: () => Promise<boolean>;

  /**
   * 注册子表生命周期端口；返回取消注册函数，应随子表卸载调用。
   */
  registerChild: <K extends FieldKey<Model>>(module: CrudChildModule<Model, K>) => () => void;
  /** 装配组件登记主表校验与聚焦，页面无需维护 MyForm 实例。 */
  registerForm: (port: CrudFormPort<Model>) => () => void;

  /**
   * 打开指定目标/参照；返回是否成功，失败或守卫拦截时为 false。
   */
  open: (target: CrudTarget<Id>) => Promise<boolean>;

  /**
   * 检查未保存修改并询问是否离开；返回 false 时保持当前页。
   */
  canLeave: () => Promise<boolean>;
  /** 批量关闭后续页面拒绝时，撤回本次尚未消费的离开许可。 */
  cancelLeaveApproval: () => void;
}
/** 主表校验与错误定位端口；由 MyCrudForm 注册，不访问内部 el-form 实例。 */
export interface CrudFormPort<Model> {
  /**
   * 运行校验并返回结果；不把校验当作保存，也不应在校验内写入服务端。
   */
  validate: () => Promise<CrudValidation<Model>>;

  /**
   * 清除表单校验提示；不清空模型值，也不改变保存基线。
   */
  clear: () => void;

  /**
   * 定位对应错误或聚焦输入控件；用于校验反馈，不修改业务数据。
   */
  focus: (issue: CrudIssue<Model>) => void | Promise<void>;
}
/** 只读详情控制器；实体加载和业务动作状态彼此区分。 */
export interface CrudDetailController<Model, Entity, Id extends string | number> {
  /**
   * 控制器只读响应式状态；模板可读取，业务更新必须通过公开方法，不能直接赋值。
   */
  readonly state: DeepReadonly<{
    /**
     * 稳定标识；保留声明的 string/number 类型，不使用数组下标。null 表示尚未加载。
     */
    id: Id | null;

    /**
     * 当前生命周期阶段；依据联合字面量显示加载/失败/就绪界面，不手动变更。
     */
    phase: "idle" | "loading" | "ready" | "error";

    /**
     * 最近读取的后端实体；未加载为 null，与转换后的页面 model 分开保管。
     */
    entity: Entity | null;

    /**
     * 当前页面模型；表单字段与联动使用它，不等同于后端保存 DTO。
     */
    model: Model | null;

    /**
     * 本次失败信息；无错误时为空值。unknown 类型需先判断再读取 message。
     */
    error: string | null;
  }>;

  /**
   * 按实体 ID 读取详情；透传取消信号，避免旧响应覆盖新目标。
   */
  load: (id: Id) => Promise<void>;

  /**
   * 重新读取当前数据；复用现有条件/目标，不提交写入操作。
   */
  refresh: () => Promise<void>;

  /**
   * 正在执行的动作 key；null 表示空闲，不能依赖按钮文案判断忙碌。
   */
  readonly busyActionKey: string | null;

  /**
   * 最近动作失败的展示文案；null 表示无动作错误，与详情加载错误区分。
   */
  readonly actionError: string | null;

  /**
   * 最近动作回执；null 表示没有回执，批量结果可能包含部分失败。
   */
  readonly actionResult: DeepReadonly<CrudActionResult<Id>> | null;

  /**
   * 读取动作当前可见性和禁用原因；用于展示，执行时控制器仍会重新检查。
   */
  actionAvailability: (key: string) => {
    /**
     * 是否显示此操作；false 隐藏，禁用但可见应使用 reason。
     */
    visible: boolean;
    /**
     * 面向用户的原因说明；允许操作时省略，拦截时说明如何解除限制。
     */
    reason?: string;
  };

  /**
   * 按配置 key 执行动作，内部处理权限、确认和忙碌；行操作还需 rowKey。
   * @example
   * `await list.runAction("approve", "C001")`
   */
  runAction: (key: string) => Promise<void>;
}
/** 子模块只操作整单中的某个字段；唯一已提交值仍归主表单。 */
export interface CrudChildModule<Model, K extends FieldKey<Model>> {
  /**
   * 子表草稿结构版本；不兼容变更时递增，不能静默套用旧快照。
   */
  draftVersion?: number;

  /**
   * 导出可恢复的子表编辑草稿；仅包含白名单业务数据，不保存组件实例或函数。
   */
  snapshotDraft?: () => unknown;

  /**
   * 验证并恢复子表草稿快照；不兼容时返回 false，不盲目信任本地数据。
   */
  restoreDraft?: (snapshot: unknown) => Promise<boolean>;

  /**
   * 订阅草稿变化；返回取消订阅函数，卸载时调用以避免内存泄漏。
   */
  subscribeDraft?: (listener: () => void) => () => void;

  /**
   * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
   */
  key: K;

  /**
   * 检查子表是否存在未提交编辑；不能只看主表模型判断整单脏状态。
   */
  isDirty?: () => boolean;

  /**
   * 将子表临时编辑提交到主模型；不是后端保存，失败时返回拦截原因。
   */
  commitDraft: (context: {
    /**
     * 请求取消信号；必须传到底层 API，取消等待不代表服务端事务回滚。
     */
    signal: AbortSignal;
  }) => Promise<CrudGuardResult>;

  /**
   * 撤销子表尚未提交的行编辑；不撤销已完成的服务端保存。
   */
  cancelDraft: () => void;

  /**
   * 运行校验并返回结果；不把校验当作保存，也不应在校验内写入服务端。
   */
  validate: (
    value: DeepReadonly<Model[K]>,
    context: {
      /**
       * 请求取消信号；必须传到底层 API，取消等待不代表服务端事务回滚。
       */
      signal: AbortSignal;
      /**
       * 当前校验轮次；异步结果仅能用于同一轮次，避免过期结果覆盖。
       */
      revision: number;
    }
  ) => Promise<CrudValidation<Model>>;

  /**
   * 定位对应错误或聚焦输入控件；用于校验反馈，不修改业务数据。
   */
  focus: (issue: CrudIssue<Model>) => Promise<void>;

  /**
   * 同步主表只读状态到子表；true 禁止编辑，false 恢复正常编辑策略。
   */
  setReadonly: (readonly: boolean) => void;
}
/** 子表主模型字段的受控绑定；只读值配合 replace 更新。 */
export interface CrudChildBinding<Model, K extends FieldKey<Model>> {
  /**
   * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
   */
  readonly value: DeepReadonly<Model[K]>;

  /**
   * 是否只读；只限制当前 UI 编辑，不能代替服务端鉴权。
   */
  readonly readonly: boolean;

  /**
   * 整体替换绑定值/行数组；通过公开端口通知主表，不能直接改只读 rows/value。
   */
  replace: (value: Model[K]) => void;
}
/** 可编辑子表的公开绑定；负责连接主表与行编辑端口，不持有后端写接口。 */
export interface CrudTableBinding<Row extends object> {
  /**
   * 当前行集合；控制器返回的是只读快照，修改请调用 replace/patch 等公开方法。
   */
  readonly rows: DeepReadonly<Row[]>;

  /**
   * 是否只读；只限制当前 UI 编辑，不能代替服务端鉴权。
   */
  readonly readonly: boolean;

  /**
   * 当前存在加载/保存/子表提交等进行中任务；为 true 时不重复触发操作。
   */
  readonly busy: boolean;

  /**
   * 整体替换绑定值/行数组；通过公开端口通知主表，不能直接改只读 rows/value。
   */
  replace: (rows: Row[]) => void;

  /**
   * 注册表格公开编辑端口并返回解绑函数；不访问私有 ref 或内部 DOM。
   */
  register: (port: {
    /**
     * 导出可恢复的子表编辑草稿；仅包含白名单业务数据，不保存组件实例或函数。
     */
    snapshotDraft?: (fields: readonly FieldKey<Row>[]) => unknown;

    /**
     * 验证并恢复子表草稿快照；不兼容时返回 false，不盲目信任本地数据。
     */
    restoreDraft?: (snapshot: unknown, fields: readonly FieldKey<Row>[]) => Promise<boolean>;

    /**
     * 订阅草稿变化；返回取消订阅函数，卸载时调用以避免内存泄漏。
     */
    subscribeDraft?: (listener: () => void) => () => void;

    /**
     * 提交当前行临时编辑或已通过守卫的参照值；不自动保存到后端。
     */
    commit: () => Promise<boolean>;

    /**
     * 检查子表是否存在未提交编辑；不能只看主表模型判断整单脏状态。
     */
    isDirty: () => boolean;

    /**
     * 取消当前未提交的行编辑；不发起删除或保存请求。
     */
    cancel: () => void;

    /**
     * 运行校验并返回结果；不把校验当作保存，也不应在校验内写入服务端。
     */
    validate: (rows: readonly Row[]) => Promise<{
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: boolean;

      /**
       * 逐项校验错误；每项提供行主键、列字段和可展示文案。
       */
      errors: readonly {
        /**
         * 稳定行主键；必须与表格 getKey 一致，用于定位而不是行号。
         */
        rowKey: string | number;
        /**
         * 模型字段名；从类型提示选择实际存在的 key，用于配置/错误定位。
         */
        field: FieldKey<Row>;
        /**
         * 面向用户的结果或错误说明；填写可理解的业务原因，避免原始堆栈。
         */
        message: string;
      }[];
    }>;

    /**
     * 定位对应错误或聚焦输入控件；用于校验反馈，不修改业务数据。
     */
    focus: (key: string | number, field: string) => Promise<void>;
  }) => () => void;
}
/** 子行增删改通知；携带稳定行键，patch 只报告部分字段。 */
export type CrudChildTableChange<Row, Key extends string | number> =
  | {
      /**
       * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
       */
      type: "add";
      /**
       * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
       */
      key: Key;
    }
  | {
      /**
       * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
       */
      type: "remove";
      /**
       * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
       */
      key: Key;
    }
  | {
      /**
       * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
       */
      type: "patch";
      /**
       * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
       */
      key: Key;
      /**
       * 本次产生的部分模型修改；只包含发生变化的字段，不提交整个上下文。
       */
      changes: Partial<Row>;
    };
/** 列表公开插槽合同；工具栏接收控制器，列插槽接收只读行和值。 */
export type CrudListSlots<Row, Id extends string | number, S extends QuerySchema> = {
  /**
   * 更多操作面板中的扩展插槽，收到公开列表控制器；适合低频、基于选择的按钮。
   * 历史名称 toolbar-left 保持兼容，不再占据常驻工具栏宽度。
   * @example
   * `<template #toolbar-left="{ state }"><ActionButton label="查看选中项" /></template>`
   */
  "toolbar-left"?: (context: CrudListController<Row, Id, S>) => VNodeChild;

  /**
   * 工具栏右侧扩展插槽，收到公开列表控制器；默认查询/分页仍由公共组件负责。
   */
  "toolbar-right"?: (context: CrudListController<Row, Id, S>) => VNodeChild;
} & {
  [K in FieldKey<Row> as `column-${K}`]?: (context: {
    /**
     * 当前行只读快照；渲染可读取，编辑请走表格/控制器公开更新方法。
     */
    row: DeepReadonly<Row>;

    /**
     * 稳定行主键；必须与表格 getKey 一致，用于定位而不是行号。
     */
    rowKey: Id;

    /**
     * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
     */
    value: DeepReadonly<Row[K]>;
  }) => VNodeChild;
} & {
  [K in Extract<keyof S, string> as `query-${K}`]?: (context: {
    /**
     * 草稿状态/接口：查询草稿尚未应用，表单草稿由 useCrudDraft 管理；按声明类型使用。
     */
    draft: DeepReadonly<QueryDraft<S>>;

    /**
     * 替换未应用的查询草稿，不立即请求；通常供查询插槽接收编辑结果。
     */
    setDraft: (draft: QueryDraft<S>) => void;
  }) => VNodeChild;
};
/** 表单公开插槽合同；通过 update/控制器修改模型，不能直接修改插槽快照。 */
export type CrudFormSlots<Model, Entity, Id extends string | number> = {
  [K in FieldKey<Model> as `field-${K}`]?: (context: {
    /**
     * 当前页面模型；表单字段与联动使用它，不等同于后端保存 DTO。
     */
    model: DeepReadonly<Model>;

    /**
     * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
     */
    value: DeepReadonly<Model[K]>;

    /**
     * 是否只读；只限制当前 UI 编辑，不能代替服务端鉴权。
     */
    readonly: boolean;

    /**
     * 更新当前字段的公开回调；传该字段的值，不直接赋值到只读 model。
     */
    update: (value: Model[K]) => void;
    /** 确认字段已编辑完毕；输入框绑定 change，快捷按钮 update 后调用；等值变更不重复通知。
     * @example
     * <el-input :model-value="value" @update:model-value="update" @change="commit" />
     */ commit: () => void;
  }) => VNodeChild;
} & {
  [K in `section-${string}`]?: (context: CrudFormController<Model, Entity, Id>) => VNodeChild;
} & {
  /**
   * 主表字段前的扩展区，位于表单卡片内并随正文滚动；省略时不占空间。
   * 接收原表单控制器，可放辅助开关、说明和状态提示；不替换字段或保存工具栏。
   * @example
   * <template #header><el-checkbox v-model="state.custom.requirePhone">必须填电话</el-checkbox></template>
   */
  header?: (context: CrudFormController<Model, Entity, Id>) => VNodeChild;
  /**
   * 底部扩展插槽；参数是当前页面控制器，返回 Vue 可渲染内容。
   */
  footer?: (context: CrudFormController<Model, Entity, Id>) => VNodeChild;
};
/** 详情公开插槽合同；用于只读字段、子表页签和底部业务扩展。 */
export type CrudDetailSlots<Model, Entity, Id extends string | number> = {
  [K in `tab-${string}`]?: (context: CrudDetailController<Model, Entity, Id>) => VNodeChild;
} & {
  /**
   * 底部扩展插槽；参数是当前页面控制器，返回 Vue 可渲染内容。
   */
  footer?: (context: CrudDetailController<Model, Entity, Id>) => VNodeChild;
};
