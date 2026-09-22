import type { CrudColumnIdentity } from "@/composables/useCrudColumns";
import type { ReferenceOverrides } from "../fields/reference-overrides";
import type { BusinessPresentation } from "./presentation";
import type { CrudLayoutOptions, CrudDetailSummary } from "./layout";
import type { ArrayModelKey } from "./aggregate";
import type { CrudListSlots, CrudFormSlots, CrudDetailSlots, CrudTableBinding } from "./types";
import type { DeepReadonly, Slots, VNode, VNodeChild, UnwrapNestedRefs } from "vue";
import type { BusinessModuleContract, BusinessModuleConfig, List, Form, Detail } from "./module";
import type {
  CrudNavigation,
  CrudListController,
  CrudFormController,
  CrudDetailController,
  CrudSaveInput,
  CrudGuardResult,
  CrudValidation,
  CrudTarget,
  CrudRequestContext,
} from "./types";
import type { BatchCommand, BatchExecutor, BatchController } from "./batch";

/** 统一页面的模块端口；配置仍由 defineBusinessModule 创建。 */
export interface CrudPageModule<T extends BusinessModuleContract> extends Omit<
  BusinessModuleConfig<T>,
  "model"
> {
  /** 编译期合同标记，不读写也不参与持久化。 */
  readonly __contract?: T;
  /** 生成当前实例合同，不创建控制器或发请求。 */
  createRuntime: (
    navigation: CrudNavigation<T["Id"]>,
    mode?: "add" | "edit"
  ) => {
    /** 稳定模块 key。 */ key: string;
    /** 列表配置。 */ list: List<T>;
    /** 新增/编辑配置。 */ form: Form<T>;
    /** 详情配置。 */ detail: Detail<T>;
  };
}
/** 所有页面钩子共同的只读环境。 */
export interface CrudPageHookContext<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudRequestContext<T["Context"]> {
  /** 辅助状态快照，不含表单模型；异步修改通过返回 state 补丁完成。 */
  state: DeepReadonly<UnwrapNestedRefs<S>>;
}
/** 初始化返回值；应用前检查取消信号，不写入服务器。 */
export interface CrudPagePreparation<S extends object> {
  /** 辅助状态补丁；省略不更新，不进入 DTO/草稿。 */
  state?: Partial<S>;
}
/** 编辑/详情准备只返回辅助状态，不允许返回模型默认值覆盖服务端回显。 */
export interface CrudPageReadPreparation<S extends object> extends CrudPagePreparation<S> {
  /** 编辑/详情禁止默认模型补丁；新增使用 CrudPageAddPreparation。 */
  defaults?: never;
}
/** 新增初始化允许补充初值；先于草稿恢复应用。 */
export interface CrudPageAddPreparation<M, S extends object> extends CrudPagePreparation<S> {
  /** 新增模型补丁；只覆盖声明字段，编辑钩子不能返回此成员。 */
  defaults?: Partial<M>;
}
/** 表单页面的生命周期；全部可选，公共规则先执行，页面规则追加。 */
export interface CrudPageFormHooks<
  T extends BusinessModuleContract,
  S extends object,
  V extends "add" | "edit",
> {
  /** 初始化准备；可取消，新增可返回 defaults，编辑仅允许 state。不代替详情加载。
   * @example
   * `beforeOpen: async () => ({ state: { hint: "" } })`
   */
  beforeOpen?: (
    input: CrudPageHookContext<T, S> & {
      /** 新增无 ID；编辑为本实例固定 ID。 */
      target: V extends "add"
        ? {
            /** 新增场景。 */ mode: "add";
          }
        : {
            /** 编辑场景。 */ mode: "edit";
            /** 原始类型 ID。 */ id: T["Id"];
          };
    }
  ) => Promise<
    (V extends "add" ? CrudPageAddPreparation<T["Model"], S> : CrudPageReadPreparation<S>) | void
  >;
  /** 默认值、回显及草稿决定完成后执行一次；只读模型，不覆盖恢复内容。 */
  afterOpen?: (
    input: CrudSaveInput<T["Model"], T["Entity"], T["Id"], T["Context"]> & CrudPageHookContext<T, S>
  ) => Promise<void>;
  /** 额外跨字段校验，返回定位 issues；不替代模块和子表校验。
   * @example
   * `validate: async () => ({ valid: true })`
   */
  validate?: (
    input: CrudSaveInput<T["Model"], T["Entity"], T["Id"], T["Context"]> & CrudPageHookContext<T, S>
  ) => Promise<CrudValidation<T["Model"]>>;
  /** 校验通过后的业务守卫；返回 proceed:false 与原因停止保存。
   * @example
   * `beforeSave: async () => ({ proceed: true })`
   */
  beforeSave?: (
    input: CrudSaveInput<T["Model"], T["Entity"], T["Id"], T["Context"]> & CrudPageHookContext<T, S>
  ) => Promise<CrudGuardResult>;
  /** 保存及回填成功后执行，再执行默认导航；失败不重新提交。
   * @example
   * `afterSave: async ({ entity }) => { console.info(entity.id); }`
   */
  afterSave?: (
    input: CrudPageHookContext<T, S> & {
      /** 已回填实体，只读。 */ entity: DeepReadonly<T["Entity"]>;
    }
  ) => Promise<void>;
  /** 业务关闭检查；公共脏状态与提交状态检查仍生效。 */
  beforeClose?: (input: {
    /** 是否有未保存内容。 */ dirty: boolean;
    /** 当前目标。 */ target: CrudTarget<T["Id"]>;
  }) => Promise<CrudGuardResult>;
}
/** 列表可选钩子；当前有效查询才执行成功钩子。 */
export interface CrudPageListHooks<T extends BusinessModuleContract, S extends object> {
  /** 查询前检查只读 DTO；不更改固定组织范围。 */
  beforeQuery?: (
    input: CrudPageHookContext<T, S> & {
      /** 已适配 DTO。 */ query: DeepReadonly<T["Query"]>;
    }
  ) => Promise<CrudGuardResult>;
  /** 数据源成功且行键有效后执行；取消或迟到结果不调用。 */
  afterQuery?: (
    input: CrudPageHookContext<T, S> & {
      /** 当前页只读行。 */ rows: DeepReadonly<T["Model"][]>;
      /** 全查询记录数。 */ total: number;
    }
  ) => Promise<void>;
}
/** 详情生命周期；无表单保存钩子。 */
export interface CrudPageDetailHooks<T extends BusinessModuleContract, S extends object> {
  /** 加载前准备，失败可重试；不替代详情请求。 */
  beforeOpen?: (
    input: CrudPageHookContext<T, S> & {
      /** 本实例固定 ID。 */ target: {
        /** 详情场景。 */ mode: "detail";
        /** 原始类型主键。 */ id: T["Id"];
      };
    }
  ) => Promise<CrudPageReadPreparation<S> | void>;
  /** 当前有效实体转换完成后执行；只读输入，失败显示详情错误。 */
  afterOpen?: (
    input: CrudPageHookContext<T, S> & {
      /** 接口实体。 */ entity: DeepReadonly<T["Entity"]>;
      /** 页面只读模型。 */ model: DeepReadonly<T["Model"]>;
    }
  ) => Promise<void>;
}
/** 所有页面的实例选项。 */
export interface CrudPageOptions<T extends BusinessModuleContract, S extends object> {
  /** 覆盖指定导航方法；省略保留模块默认路径/弹窗语义。saved 仅在保存成功后调用。
   * @example
   * `navigation: { saved: async id => { await router.push("/orders/" + id); } }`
   */
  navigation?: CrudNavigation<T["Id"]>;
  /** 每个页面独立创建的普通辅助状态；只放对象、数组、Date 和原始值，不放函数、组件或循环引用。省略为空，不提交或自动持久化。
   * @example
   * `state: () => ({ hint: "", panelOpen: false })`
   */
  state?: () => S;
}
/** 列表专用装配。 */
export interface CrudListPageOptions<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageOptions<T, S> {
  /** 列表场景，仅创建列表控制器。 */ view: "list";
  /** 可选查询钩子。 */ hooks?: CrudPageListHooks<T, S>;
  /** index 专属批量规则；未配置不创建批量控制器。 */
  batch?: {
    /** 当前模块批量接口适配器。 */ request: BatchExecutor<T["Query"]>;
    /** 命令、权限与可操作范围。 */ commands: readonly BatchCommand<T["Model"]>[];
  };
}
/** 新增或编辑装配；场景在创建时固定。 */
export interface CrudFormPageOptions<
  T extends BusinessModuleContract,
  S extends object,
  V extends "add" | "edit",
> extends CrudPageOptions<T, S> {
  /** add 新增，edit 编辑；不在运行时切换。 */ view: V;
  /** 当前实例主表参照覆盖；只替换参照定义，不修改共享 fields 或 links。 */
  form?: {
    /** 按字段值约束覆盖；通常使用原参照的 withMap。 */
    references?: ReferenceOverrides<T["Model"], T["Context"]>;
  };
  /** 当前页可选生命周期，类型从模块自动推导。 */ hooks?: CrudPageFormHooks<T, S, V>;
}
/** 详情装配。 */
export interface CrudDetailPageOptions<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageOptions<T, S> {
  /** 只读详情场景。 */ view: "detail";
  /** 可选初始化钩子。 */ hooks?: CrudPageDetailHooks<T, S>;
}
/** 默认容器消费的公开视图端口，扩展布局仍可使用底层 bindings。 */
export interface CrudPageShell {
  /** 渲染当前场景；只调用一次，不自行创建第二份状态。 */ render: (slots: Slots) => VNode;
  /** 当前操作是否忙碌，只读派生。 */ readonly busy: boolean;
}
/** 直接组件布局的公共环境；不触发渲染。 */
export interface CrudViewEnvironment {
  /** 模块提示；空值时不显示提示条。 */ readonly notice: string | undefined;
  /** 固定目标缺失等初始化错误；空值时允许挂载业务组件。 */ readonly invalidReason:
    | string
    | undefined;
  /** 当前页面的弹窗和抽屉宿主，表单也可打开跨模块页面。 */ readonly host:
    | {
        /** 当前实例的呈现管理器。 */ presentation: BusinessPresentation;
        /** 嵌入编辑保存后刷新宿主，不再次提交。 */ afterSave: () => Promise<void>;
      }
    | undefined;
}
/** 页面共同能力。 */
export interface CrudPageBase<T extends BusinessModuleContract, S extends object>
  extends CrudPageShell, CrudViewEnvironment {
  /** 仅编译期关联默认视图与模块类型；运行时不创建数据副本。 */
  readonly __contract?: T;
  /** 本实例响应式辅助状态，可直接修改；不复制控制器模型。 */ state: UnwrapNestedRefs<S>;
  /** 统一导航，固定模块路径及弹窗宿主语义。 */ navigation: CrudNavigation<T["Id"]>;
}
/** 列表页面返回值。 */
export interface CrudListPage<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageBase<T, S> {
  /** 当前场景。 */ view: "list";
  /** 原列表控制器，不复制 rows/query/selection。 */ list: CrudListController<
    T["Model"],
    T["Id"],
    T["Schema"]
  >;
  /** 未配置 batch 时为空。 */ batch?: BatchController;
  /** 直接组件所需绑定；不创建另一控制器。 */ bindings: {
    /** 列表 props；每次读取保留最新上下文与偏好。 */ readonly list: {
      /** 当前列表配置。 */ config: List<T>;
      /** 唯一列表控制器。 */ controller: CrudListController<T["Model"], T["Id"], T["Schema"]>;
      /** 当前上下文。 */ context: DeepReadonly<T["Context"]>;
      /** 默认导航与覆盖。 */ navigation: CrudNavigation<T["Id"]>;
      /** 权限/组织范围。 */ scopeKey: string;
      /** 列设置存储身份。 */ preference: CrudColumnIdentity;
      /** 可选批量控制器。 */ batch: BatchController | undefined;
      /** 标准模块的新增权限，独立列表省略时保留旧行为。 */ createPermitted?: boolean;
      /** create 意图的视觉模式，默认 halo，false 仅文字。 */ guideMode?:
        | "halo"
        | "spotlight"
        | false;
      /**
       * 列表内自动挂载的编辑宿主；仅模块配置 dialog/drawer 时存在。
       * 自定义布局不使用 MyCrudList 时，可改用同页 bindings.host 手动挂载一次。
       */
      host: CrudViewEnvironment["host"];
    };
  };
}
/** 表单页面返回值。 */
export interface CrudFormPage<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageBase<T, S> {
  /** 当前场景。 */ view: "add" | "edit";
  /** 原表单控制器；写入用 patch/save，不直接修改 state.model。 */ form: CrudFormController<
    T["Model"],
    T["Entity"],
    T["Id"]
  >;
  /** 读取已装配的同一子表绑定；未知或没有视图的 key 抛错，不重复注册。 */
  child: <K extends ArrayModelKey<T["Model"]>>(
    key: K
  ) => CrudTableBinding<T["Model"][K] extends readonly (infer Row extends object)[] ? Row : never>;
  /** 高级布局的公开 MyCrudForm props；仍使用同一控制器。 */ bindings: {
    /** 完整表单 props。 */ form: {
      /** 跨模块页面宿主，标准表单自动挂载。 */ host?: CrudViewEnvironment["host"];
      /** 内容布局；省略保持原外壳。 */ layout?: CrudLayoutOptions;
      /** 新增/编辑标题的实体称呼。 */ entityLabel?: string;
      /** 原控制器。 */ controller: CrudFormController<T["Model"], T["Entity"], T["Id"]>;
      /** 字段合同。 */ fields: Form<T>["fields"];
      /** 子表分区。 */ sections: Form<T>["sections"];
      /** 字段联动。 */ links: BusinessModuleConfig<T>["links"];
      /** 当前业务上下文。 */ readonly context: DeepReadonly<T["Context"]>;
      /** 栅格列数。 */ columns: 1 | 2 | 3;
      /** 只读原因。 */ readonly readonlyReason: string | undefined;
      /** 固定实体 key。 */ readonly entityKey: T["Id"] | "new";
    };
  };
}
/** 详情页面返回值。 */
export interface CrudDetailPage<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageBase<T, S> {
  /** 当前场景。 */ view: "detail";
  /** 默认编辑入口；内部复核权限、只读和加载状态。 */ edit: () => Promise<void>;
  /** 是否显示默认编辑动作。 */ readonly canEdit: boolean;
  /** 编辑动作禁用原因；可编辑时 undefined。 */ readonly editReason: string | undefined;
  /** 直接详情组件绑定。 */ bindings: {
    /** 与默认容器共用的详情 props。 */ readonly detail: {
      /** 原详情页的编辑入口，复核权限及只读状态。 */ edit?: () => Promise<void>;
      /** 是否允许展示默认编辑按钮。 */ canEdit?: boolean;
      /** 当前编辑限制，undefined 表示无额外限制。 */ editReason?: string;
      /** 内容布局；省略保持原外壳。 */ layout?: CrudLayoutOptions;
      /** 详情标题的实体称呼。 */ entityLabel?: string;
      /** 按模型字段键配置摘要；省略不展示。 */ summary?: CrudDetailSummary<T["Model"]>;
      /** 唯一详情控制器。 */ controller: CrudDetailController<T["Model"], T["Entity"], T["Id"]>;
      /** 主信息字段。 */ fields: Detail<T>["fields"];
      /** 子表页签。 */ tabs: Detail<T>["tabs"];
      /** 配置业务动作。 */ actions: Detail<T>["actions"];
      /** 当前上下文。 */ context: DeepReadonly<T["Context"]>;
      /** 默认返回入口。 */ back: CrudNavigation<T["Id"]>["close"];
      /** 布局列数。 */ columns: 1 | 2 | 3;
      /**
       * 详情内自动挂载的编辑宿主；仅模块配置 dialog/drawer 时存在。
       * 自定义详情布局不使用 MyCrudDetail 时，可改用同页 bindings.host 手动挂载一次。
       */
      host: CrudViewEnvironment["host"];
    };
  };
  /** 原详情控制器。 */ detail: CrudDetailController<T["Model"], T["Entity"], T["Id"]>;
}

/** 默认页面公开插槽；场景决定工具栏、字段或详情可用插槽，保留模型字段类型。 */
export type CrudPageSlots<
  T extends BusinessModuleContract,
  V extends "list" | "add" | "edit" | "detail",
> = {
  /** 内容前扩展区；不覆盖默认工具栏，不需要自行写 CSS。 */
  "before-content"?: () => VNodeChild;
  /** 内容后扩展区；可放业务提示或独立组件。 */
  "after-content"?: () => VNodeChild;
} & (V extends "list"
  ? CrudListSlots<T["Model"], T["Id"], T["Schema"]>
  : V extends "detail"
    ? {
        /** 追加详情动作；内置编辑入口仍由模块权限及只读原因控制。 */
        actions?: () => VNodeChild;
        /** 详情底部扩展；接收原详情控制器。 */
        footer?: CrudDetailSlots<T["Model"], T["Entity"], T["Id"]>["footer"];
      } & {
        [K in ArrayModelKey<T["Model"]> as `tab-${K}`]?: (input: {
          /** 当前子表只读行；详情不提供编辑绑定。 */
          rows: DeepReadonly<T["Model"][K]>;
        }) => VNodeChild;
      }
    : Omit<CrudFormSlots<T["Model"], T["Entity"], T["Id"]>, `section-${string}`> & {
        [K in ArrayModelKey<T["Model"]> as `section-${K}`]?: (input: {
          /** 当前子表行，只读使用；回写由 binding.replace 统一处理。 */
          rows: DeepReadonly<T["Model"][K]>;
          /** 原表单子表端口；自定义 MyCrudChildTable 传入此值。 */
          binding: CrudTableBinding<
            T["Model"][K] extends readonly (infer Row extends object)[] ? Row : never
          >;
        }) => VNodeChild;
      });
