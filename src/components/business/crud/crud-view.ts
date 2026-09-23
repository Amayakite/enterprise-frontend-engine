import type { ReferenceOverrides } from "../fields/reference-overrides";
import type { BatchCommand, BatchExecutor } from "./batch";
import type {
  CrudListController,
  CrudFormController,
  CrudDetailController,
  CrudNavigation,
} from "./types";
import type { CrudFormProps } from "./form-presentation";
import type { FormChange } from "../fields/types";
import type { DeepReadonly, UnwrapNestedRefs } from "vue";
import type { BusinessModuleContract } from "./module";
import type {
  CrudPageOptions,
  CrudPageFormHooks,
  CrudPageListHooks,
  CrudPageDetailHooks,
  CrudListBinding,
  CrudDetailBinding,
  CrudChildBinding,
  CrudViewEnvironment,
} from "./crud-page";

/** 钩子只读辅助状态快照；模型仍从钩子 model/rows 参数读取，避免初始化时读取旧模型。 */
export interface CrudHookState<S> {
  /** state 工厂的实例数据快照；不可直接修改，beforeOpen 通过返回 state 补丁更新。 */
  readonly custom: S;
}
/** 当前模块的组件参数缩写；避免在拆分绑定中重复声明字段合同。 */
type FormProps<T extends BusinessModuleContract> = CrudFormProps<
  T["Model"],
  T["Entity"],
  T["Id"],
  DeepReadonly<T["Context"]>
>;

/** change 的可选回写结果；只应用当前有效事务，不向服务器提交。 */
export interface CrudChangeResult<M, S> {
  /** 业务补充字段，经过原 patch 与同步 links；不会递归触发用户 change。 */
  patch?: Partial<M>;
  /** 页面辅助数据补丁，合并 state.custom，不进入 DTO。 */
  state?: Partial<S>;
}
/** 已确认字段事务的异步业务环境；模型在事件发生时拍摄快照。 */
export interface CrudChangeInput<
  T extends BusinessModuleContract,
  S extends object,
> extends FormChange<T["Model"]> {
  /** 辅助状态只读快照；返回 result.state 修改，避免迟到结果直接写页面。 */
  state: CrudHookState<DeepReadonly<UnwrapNestedRefs<S>>>;
  /** 当前业务上下文快照。 */ context: DeepReadonly<T["Context"]>;
  /** 新输入、初始化或卸载会取消；异步请求必须透传，外部副作用前复核。 */ signal: AbortSignal;
}
/** 可选表单生命周期；模型快照和辅助状态都只读，公共规则始终优先。 */
export interface CrudViewFormHooks<
  T extends BusinessModuleContract,
  S extends object,
  V extends "add" | "edit",
> {
  /** 用户确认或参照依赖清空后执行，ID/map/同步 links 已完成；未配置不追踪事务。
   * 文本在原生 change 时触发，选择类在提交后触发；按 field/reason/changes 筛选业务。
   * 可返回 patch/state；新输入取消旧任务，迟到结果丢弃。异步处理中或失败时阻止保存，
   * 失败可重试；不在此调用保存 API。需要重新计算的纯同步规则优先配置 links。
   * @example
   * change: async ({ field, model }) => field === "customerName" ? { state: { hint: model.customerName } } : undefined
   */
  change?: (
    input: CrudChangeInput<T, S>
  ) => void | CrudChangeResult<T["Model"], S> | Promise<void | CrudChangeResult<T["Model"], S>>;

  /** 打开前准备；返回 state 合并 custom，defaults 仅新增允许，不替代加载或草稿恢复。
   * @example
   * beforeOpen: async () => ({ state: { hint: "已准备" } })
   */ beforeOpen?: CrudPageFormHooks<T, S, V>["beforeOpen"];
  /** 回显及草稿决定完成后执行；模型从 input.model 读取，不覆盖草稿。 */
  afterOpen?: CrudPageFormHooks<T, S, V>["afterOpen"];
  /** 追加跨字段校验；返回 valid:false 和定位 issues 阻止保存，不替代公共规则。 */
  validate?: CrudPageFormHooks<T, S, V>["validate"];
  /** 校验通过后的提交守卫；返回 proceed:false 阻止写入。
   * @example
   * beforeSave: async ({ state }) => state.custom.reviewed ? { proceed: true } : { proceed: false, reason: "请先核对" }
   */ beforeSave?: CrudPageFormHooks<T, S, V>["beforeSave"];
  /** 保存和回填成功后执行；随后默认导航，抛错不会重新提交。 */
  afterSave?: CrudPageFormHooks<T, S, V>["afterSave"];
  /** 追加关闭检查；公共提交锁与脏状态守卫仍生效。 */
  beforeClose?: CrudPageFormHooks<T, S, V>["beforeClose"];
}
/** 列表选项；state 工厂决定 custom 类型，不从钩子反向推导。 */
export interface CrudListViewOptions<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageOptions<T, S> {
  /** 固定列表场景。 */ view: "list";
  /** 可选查询规则；参数的 state.custom 为只读快照。 */
  hooks?: CrudPageListHooks<T, NoInfer<S>>;
  /** 按需创建批量控制器，命令权限仍由原合同管理。 */
  batch?: {
    /** 当前模块的批量 API 适配。 */ request: BatchExecutor<T["Query"]>;
    /** 命令、权限与允许操作的记录范围。 */ commands: readonly BatchCommand<T["Model"]>[];
  };
}
/** 新增/编辑选项；beforeOpen 返回 state 是 custom 补丁，defaults 仅新增允许。 */
export interface CrudFormViewOptions<
  T extends BusinessModuleContract,
  S extends object,
  V extends "add" | "edit",
> extends CrudPageOptions<T, S> {
  /** 创建时固定场景，不跟随全局路由切换实体。 */ view: V;
  /** 当前实例字段覆盖；默认使用模块配置。 */
  form?: {
    /** 仅覆盖本实例参照定义；不修改共享 fields 或 links。 */ references?: ReferenceOverrides<
      T["Model"],
      T["Context"]
    >;
  };
  /** 当前界面的可选生命周期；不替代公共加载、校验与保存。 */
  hooks?: CrudViewFormHooks<T, NoInfer<S>, V>;
}
/** 只读详情选项，不提供保存钩子。 */
export interface CrudDetailViewOptions<
  T extends BusinessModuleContract,
  S extends object,
> extends CrudPageOptions<T, S> {
  /** 只读详情场景。 */ view: "detail";
  /** 读取前后钩子；取消后不应用准备补丁。 */
  hooks?: CrudPageDetailHooks<T, NoInfer<S>>;
}
/** 各视图共用的状态；解构顶层 state 安全，不解构其中的原始值以免丢失响应性。 */
export interface CrudViewState<S extends object> {
  /** 本实例可编辑辅助数据；默认空对象，不进入模型、DTO、草稿或 Pinia。
   * @example
   * state.custom.reviewed = true;
   */ readonly custom: UnwrapNestedRefs<S>;
  /** 读取、提交或业务动作进行中；只读，不手动修改。 */ readonly busy: boolean;
  /** 模块级提示；undefined 时不显示。 */ readonly notice: string | undefined;
  /** 缺失固定目标等错误；存在时不要挂载业务组件。 */ readonly invalidReason: string | undefined;
}
/** 列表视图；状态来自原列表控制器，不镜像 rows/query/selection。 */
export interface CrudListView<T extends BusinessModuleContract, S extends object> {
  /** 公共及列表只读状态，custom 可编辑。 */ state: CrudViewState<S> &
    CrudListController<T["Model"], T["Id"], T["Schema"]>["state"] & {
      /** 分页快照端口；修改通过 actions.setPage，页码从 1 开始。 */ readonly pagination: {
        /** 当前页码。 */ readonly pageNum: number;
        /** 每页条数。 */ readonly pageSize: number;
        /** 查询总条数。 */ readonly total: number;
      };
    };
  /** 原列表操作及导航；不复制状态，导航保留原 ID 类型。 */ actions: Omit<
    CrudListController<T["Model"], T["Id"], T["Schema"]>,
    "state" | "actionResult"
  > & {
    /** 新增/编辑/详情导航；省略的方法不可调用。 */ navigation: CrudNavigation<T["Id"]>;
    /** 请求返回列表上级；复用模块关闭导航。 */ back: () => Promise<void>;
  };
  /** 可直接传给 MyCrudList；host 仅在弹窗/抽屉模式存在。 */ bindings: {
    /** 当前列表 props；保持上下文和偏好更新。 */ readonly list: CrudListBinding<T>;
    /** 传给 MyBusinessPageHost；undefined 时不挂载。 */ readonly host: CrudViewEnvironment["host"];
  };
}
/** 新增/编辑视图；model 只读，更新使用 patch 或字段插槽 update。 */
export interface CrudFormView<T extends BusinessModuleContract, S extends object> {
  /** 表单状态与辅助数据；读取同一控制器，custom 可编辑。 */ state: CrudViewState<S> &
    CrudFormController<T["Model"], T["Entity"], T["Id"]>["state"] & {
      /** 字段业务 change 尚未完成；不禁用输入，但阻止保存。 */ readonly changing: boolean;
      /** 最近字段处理错误；null 表示无错误，可重试或重新编辑字段。 */ readonly changeError:
        | string
        | null;
      /** 只读原因；undefined 表示没有此项限制。 */ readonly readonlyReason: string | undefined;
      /** 当前保存权限；仍需后端鉴权。 */ readonly savePermission: boolean;
      /** 当前允许发起保存；点击后仍执行字段与业务校验。 */ readonly canSave: boolean;
      /** 保存不可用原因，undefined 表示可发起校验。 */ readonly saveDisabledReason:
        | string
        | undefined;
      /** 当前允许发起关闭；仍执行脏状态及业务守卫。 */ readonly canClose: boolean;
      /** 必需子表是否挂载，未就绪禁止保存/恢复。 */ readonly childrenReady: boolean;
    };
  /** 表单命令；修改经 patch，save 保留校验/草稿，back 经过离开守卫。 */ actions: Pick<
    CrudFormController<T["Model"], T["Entity"], T["Id"]>,
    "patch" | "save" | "retrySync" | "open" | "canLeave"
  > & {
    /** 重试最近失败且模型尚未变更的字段事务；无失败时无操作，不重新提交表单。 */
    retryChange: () => Promise<void>;
    /** 关闭界面；有未保存内容时询问，返回是否离开。 */ back: CrudFormController<
      T["Model"],
      T["Entity"],
      T["Id"]
    >["close"];
    /** 高级导航覆盖后的实际端口；日常关闭应使用 back。 */ navigation: CrudNavigation<T["Id"]>;
  };
  /** 实际表单 props 和同一子表编辑端口。 */ bindings: {
    /** 真实表单 props，含可选字段完成通知与保存保护；未配置 change 时回调为空。 */
    readonly form: FormProps<T>;
    /** 原主表字段及联动参数；交给 MyCrudFormFields，不新建控制器。 */
    readonly fields: Omit<
      FormProps<T>,
      "sections" | "changePending" | "changeError" | "retryChange"
    >;
    /** 独立工具栏；权限、忙碌及字段事务均来自原控制器。 */
    readonly toolbar: Pick<
      FormProps<T>,
      "controller" | "readonlyReason" | "changePending" | "changeError"
    >;
    /** 草稿、错误和重试区域；省略组件不取消底层保护。 */
    readonly feedback: Pick<
      FormProps<T>,
      "controller" | "readonlyReason" | "changePending" | "changeError" | "retryChange"
    >;
    /** 按模型数组 key 取得已装配的绑定；在 setup 读取一次，不创建另一份子表。
     * @example
     * const contacts = bindings.child("contacts");
     */ child: CrudChildBinding<T>;
  };
}
/** 详情视图；模型未加载时为 null，不提供 patch/save。 */
export interface CrudDetailView<T extends BusinessModuleContract, S extends object> {
  /** 详情只读状态及本地辅助数据。 */ state: CrudViewState<S> &
    CrudDetailController<T["Model"], T["Entity"], T["Id"]>["state"] & {
      /** 当前可显示编辑入口。 */ readonly canEdit: boolean;
      /** 编辑禁用原因；undefined 表示无此限制。 */ readonly editReason: string | undefined;
    };
  /** 详情刷新、动作和导航；不提供表单写入。 */ actions: Pick<
    CrudDetailController<T["Model"], T["Entity"], T["Id"]>,
    "refresh" | "runAction" | "actionAvailability"
  > & {
    /** 编辑当前记录；复核权限、只读原因与忙碌状态。 */ edit: () => Promise<void>;
    /** 返回列表；沿用当前模块关闭导航。 */ back: () => Promise<void>;
    /** 当前导航合同，保留 ID 类型。 */ navigation: CrudNavigation<T["Id"]>;
  };
  /** 传给真实详情组件与可选宿主。 */ bindings: {
    /** 当前详情 props，读取同一控制器。 */ readonly detail: CrudDetailBinding<T>;
    /** 独立动作工具栏；复用原详情动作与编辑权限。 */
    readonly toolbar: Pick<CrudDetailBinding<T>, "controller" | "actions" | "back"> & {
      /** 编辑当前实体，复核权限与只读状态。 */ edit: () => Promise<void>;
      /** 是否显示编辑按钮。 */ canEdit: boolean;
      /** 编辑禁用原因。 */ editReason: string | undefined;
    };
    /** 详情读取与动作反馈。 */
    readonly feedback: Pick<CrudDetailBinding<T>, "controller">;
    /** MyDesc 的原字段与模型参数；未加载时 undefined，模板须先判断。 */
    readonly description:
      | (Pick<CrudDetailBinding<T>, "fields" | "context" | "columns"> & {
          /** 当前详情模型快照，不直接修改。 */ modelValue: T["Model"];
        })
      | undefined;

    /** 嵌入编辑宿主；未启用时 undefined。 */ readonly host: CrudViewEnvironment["host"];
  };
}
