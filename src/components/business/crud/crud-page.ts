import type { CrudColumnIdentity } from "@/composables/useCrudColumns";
import type { BusinessPresentation } from "./presentation";
import type { CrudLayoutOptions, CrudDetailSummary } from "./layout";
import type { ArrayModelKey } from "./aggregate";
import type { CrudTableBinding } from "./types";
import type { DeepReadonly, UnwrapNestedRefs } from "vue";
import type { BusinessModuleContract, BusinessModuleConfig, List, Form, Detail } from "./module";
import type {
  CrudNavigation,
  CrudListController,
  CrudDetailController,
  CrudSaveInput,
  CrudGuardResult,
  CrudValidation,
  CrudTarget,
  CrudRequestContext,
} from "./types";
import type { BatchController } from "./batch";

/** 统一页面的模块端口；配置仍由 defineBusinessModule 创建。 */
export interface CrudPageModule<T extends BusinessModuleContract> extends Omit<
  BusinessModuleConfig<T>,
  "model"
> {
  /** 编译期合同标记，不读写也不参与持久化。 */
  readonly __contract?: T;
  /** 生成当前实例合同，不创建控制器或发请求。 */
  createViewConfig: (
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
  state: {
    /** 当前实例辅助状态的只读快照；通过返回 state 补丁更新。 */
    readonly custom: DeepReadonly<UnwrapNestedRefs<S>>;
  };
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
/** 标准列表绑定；每次读取保持最新上下文、偏好和权限。 */
export type CrudListBinding<T extends BusinessModuleContract> = {
  /** 当前列表配置。 */ config: List<T>;
  /** 唯一列表控制器。 */ controller: CrudListController<T["Model"], T["Id"], T["Schema"]>;
  /** 当前上下文。 */ context: DeepReadonly<T["Context"]>;
  /** 默认导航与覆盖。 */ navigation: CrudNavigation<T["Id"]>;
  /** 权限/组织范围。 */ scopeKey: string;
  /** 列设置存储身份。 */ preference: CrudColumnIdentity;
  /** 可选批量控制器。 */ batch: BatchController | undefined;
  /** 标准模块的新增权限，独立列表省略时保留旧行为。 */ createPermitted?: boolean;
  /** create 意图的视觉模式，默认 halo，false 仅文字。 */ guideMode?: "halo" | "spotlight" | false;
  /**
   * 列表内自动挂载的编辑宿主；仅模块配置 dialog/drawer 时存在。
   * 自定义布局不使用 MyCrudList 时，可改用同页 bindings.host 手动挂载一次。
   */
  host: CrudViewEnvironment["host"];
};
/** 标准详情绑定；复用唯一详情控制器，不维护页面状态副本。 */
export type CrudDetailBinding<T extends BusinessModuleContract> = {
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
/** 按主模型数组 key 读取同一聚合端口；未知 key 抛错，页面负责挂载子组件。 */
export type CrudChildBinding<T extends BusinessModuleContract> = <
  K extends ArrayModelKey<T["Model"]>,
>(
  key: K
) => CrudTableBinding<T["Model"][K] extends readonly (infer Row extends object)[] ? Row : never>;
