import type { PageResult } from "@/types/http";
import type { BusinessNavigationRequest } from "@/router/business-targets";

/** 参照使用方的导航动作；source 保持数据职责，未配置时不显示入口。 */
export interface ReferenceNavigation<Row, Id extends ReferenceId> {
  /** 已选记录的查看目标；Row 可用于选择不同目标，导航不提交选择。
   * @example
   * `view: (id) => ({ target: "customer", id })`
   */
  view?: (id: Id, row: Readonly<Row>) => BusinessNavigationRequest;
  /** 前往新增的已登记目标 key；不按来源菜单权限隐藏，目标页判断权限。 */
  create?: string;
  /** 新增完成后将路由边界 ID 转为本参照 ID；省略不自动选择，返回 null 放弃回写。
   * 回写仍经过 source.resolve、可选性与 beforeCommit 校验，不直接填名称。
   * @example
   * `createdId: (id) => id`
   */
  createdId?: (id: string) => Id | null;
  /** 覆写前往新增文案；省略从目标名称生成。 */
  createLabel?: string;
}
import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";

/** 数据源配置支持单/多选；MyReference 单多选共用内核。 */
export type ReferenceId = string | number;
/** 参照查询允许的标量值；不传 Vue 实例、函数或任意对象。 */
export type QueryValue = string | number | boolean | null | readonly QueryValue[];
/** 参照固定业务筛选的基础接口约定；具体源扩展组织/父 ID 等字段。 */
export type ReferenceFilters = Readonly<Record<string, QueryValue>>;

/** 参照普通查询条件；字段与操作符必须受数据源白名单限制。 */
export interface ReferenceCondition {
  /** 数据源可识别的字段名。 */
  key: string;
  /** 比较方式；between 的 value 应为双元素数组，in 为数组。 */
  operator: "eq" | "contains" | "in" | "between";
  /** 条件值；必须与数据源对该 key 的约定一致。 */
  value: QueryValue;
}

/** 参照列表的关键词、条件、分页与排序请求；不是主表保存 DTO。 */
export interface ReferenceQuery<F extends ReferenceFilters> {
  /** 用户输入的关键字；不含固定业务范围。 */
  keyword: string;
  /** 受控业务筛选条件，来自 MyReference filters prop。 */
  filters: F;
  /** 普通搜索条件。 */
  conditions: readonly ReferenceCondition[];
  /** 从 1 开始的页码。 */
  pageNum: number;
  /** 每页请求条数。 */
  pageSize: number;
  /** 可选排序；key 必须由数据源支持。 */
  sort?: {
    /**
     * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
     */
    key: string;
    /**
     * 排序方向：asc 升序、desc 降序；取消排序请把整个 sort 设为 null。
     */
    order: "asc" | "desc";
  };
  /** 请求用途；数据源可按候选/弹窗做不同优化，但返回接口约定不能变。 */
  purpose: "suggest" | "dialog";
}

/** 参照请求上下文；所有异步源方法必须响应取消信号。 */
export interface ReferenceRequestContext {
  /**
   * 请求取消信号；必须传到底层 API，取消等待不代表服务端事务回滚。
   */
  signal: AbortSignal;
}

/** 参照可查询字段声明；决定查询编辑器与允许值，不等于展示列。 */
export interface ReferenceSearchField {
  /** 筛选字段 key，会作为 filters/conditions 的键。 */
  key: string;
  /** 界面显示名称。 */
  label: string;
  /** 输入控件类型；dateRange 值为 `[start, end]`。 */
  type: "text" | "select" | "dateRange";
  /** 对应数据源的比较方式。 */
  operator: ReferenceCondition["operator"];
  /** select 类型的候选项；text/dateRange 不需要填写。 */
  options?: readonly {
    /**
     * 面向用户的中文显示文案；不用于接口值或缓存身份。
     * @example
     * `label: "客户名称"`
     */
    label: string;
    /**
     * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
     */
    value: string | number | boolean;
  }[];
}

/** 参照表格列声明；提供列名/格式/尺寸，公共组件统一渲染。 */
export interface ReferenceColumn<Row> {
  /** Row 的真实字符串字段 key。 */
  key: Extract<keyof Row, string>;
  /** 列标题。 */
  label: string;
  /** 建议宽度；候选表可传较小宽度，缺省时由内容撑开。 */
  width?: number;
  /** 最小宽度，推荐至少 100。 */
  minWidth?: number;
  /** 单元格对齐方式。 */
  align?: "left" | "center" | "right";
  /** 是否允许用户按列排序；数据源必须支持。 */
  sortable?: boolean;
  /** 自定义单元格文本；只用于展示，不改变提交 row。 */
  format?: (row: Readonly<Row>) => string;
}

/** 参照选择或守卫可用性；被拦截时提供用户可理解的原因。 */
export interface ReferenceAvailability {
  /**
   * 是否允许操作/使用该值；false 应附 reason 供用户了解原因。
   */
  allowed: boolean;

  /**
   * 面向用户的原因说明；允许操作时省略，拦截时说明如何解除限制。
   */
  reason?: string;
}

/** 参照按 ID 解析回执；明确区分可用行与失效 ID，不以空数组吞掉接口错误。 */
export interface ReferenceResolveResult<Row, Id extends ReferenceId> {
  /**
   * 解析或提交对应的完整行数据；用于显示名称和额外字段回填，不直接作为保存 DTO。
   */
  items: Row[];

  /**
   * 已明确失效/无权限/不存在的 ID；不能当作有效选择继续提交。
   */
  unavailableIds: Id[];
}

/**
 * MyReference 的数据源配置，统一候选搜索、已选解析和可选性校验。
 *
 * @typeParam Row 参照记录类型。
 * @typeParam Id 参照稳定主键类型。
 * @typeParam F 业务固定筛选条件类型。
 * @remarks search/resolve 必须响应 AbortSignal；filters 是受控业务范围，不应混入用户输入关键字。
 * @example
 * `const customerReference: ReferenceSource<CustomerRow, string, CustomerFilters> = { ... }`
 */
export interface ReferenceSource<Row, Id extends ReferenceId, F extends ReferenceFilters> {
  /**
   * 可读且稳定的数据源 key，用于批量请求、缓存和排障。
   * @example
   * `key: "base.customer"`
   */
  readonly key: string;
  /**
   * 选择弹窗标题。
   * @example
   * `title: "选择客户"`
   */
  readonly title: string;
  /** 从记录取得稳定 ID；必须保持 string/number 原类型。 */
  readonly getKey: (row: Readonly<Row>) => Id;
  /** 取得候选、已选标签的主显示文本。 */
  readonly getLabel: (row: Readonly<Row>) => string;
  /** 可选的次要描述，例如编码或联系电话。 */
  readonly getDescription?: (row: Readonly<Row>) => string;
  /** 弹窗表格列定义，第一列建议包含最易识别的信息。 */
  readonly columns: readonly ReferenceColumn<Row>[];
  /** 弹窗普通筛选字段；不传则只显示关键字搜索。 */
  readonly searchFields?: readonly ReferenceSearchField[];
  /** 显式声明树查询能力；未声明时保留旧 keyword/conditions 入口。 */
  readonly query?: {
    /**
     * API 可查询字段与运算符白名单；不是表格展示列数组。
     */
    schema: QuerySchema;

    /**
     * 执行分页查询；必须透传 context.signal，返回 { list, total }，不能只返回数组。
     */
    request: (
      query: QueryPageRequest<QuerySchema, F>,
      context: ReferenceRequestContext
    ) => Promise<PageResult<Row>>;
  };
  /**
   * 关键字/普通条件搜索；应根据 query.purpose 控制候选区和弹窗的响应成本。
   * @example
   * `search: (query, { signal }) => api.searchCustomers(query, { signal })`
   */
  readonly search: (
    query: ReferenceQuery<F>,
    context: ReferenceRequestContext
  ) => Promise<PageResult<Row>>;
  /**
   * 根据已选 ID 解析完整记录，用于编辑回显和提交前复核。
   * @example
   * `resolve: (ids, filters, { signal }) => api.resolveCustomers(ids, filters, { signal })`
   */
  readonly resolve: (
    ids: readonly Id[],
    filters: F,
    context: ReferenceRequestContext
  ) => Promise<ReferenceResolveResult<Row, Id>>;
  /**
   * 返回记录是否允许选择及原因；不允许的记录仍可展示，但不能确认。
   * @example
   * `selectable: (row) => ({ allowed: row.enabled, reason: row.enabled ? undefined : "客户已停用" })`
   */
  readonly selectable?: (row: Readonly<Row>) => ReferenceAvailability;
}

/** 由 Multiple 决定的受控值：单选 ID|null，多选 ID[]。 */
export type ReferenceValue<Id extends ReferenceId, Multiple extends boolean> = Multiple extends true
  ? Id[]
  : Id | null;

/** 已通过守卫的参照提交事件；包含新旧值、完整选中行和 ID 增减。 */
export interface ReferenceCommit<Row, Id extends ReferenceId, Multiple extends boolean> {
  /**
   * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
   */
  value: ReferenceValue<Id, Multiple>;

  /**
   * 本次提交前的旧值；用于比较变化，不在回调里修改。
   */
  previousValue: ReferenceValue<Id, Multiple>;

  /**
   * 解析或提交对应的完整行数据；用于显示名称和额外字段回填，不直接作为保存 DTO。
   */
  items: readonly Row[];

  /**
   * 相对 previousValue 新增的 ID；保持真实 ID 类型。
   */
  addedIds: readonly Id[];

  /**
   * 相对 previousValue 移除的 ID；清空场景用于清理关联字段。
   */
  removedIds: readonly Id[];

  /**
   * 提交来源：select 为确认选择，clear 为主动清空，dependency-clear 为上级依赖变更后的清空。
   */
  reason: "select" | "clear" | "dependency-clear";
}

/** 单/多选模型关联接口约定；multiple:true 时 modelValue 必须是数组。 */
export type ReferenceModelProps<Id extends ReferenceId> =
  | {
      /**
       * 是否多选；默认 false。单选值为 ID/null，多选为 ID[]，不能混用。
       */
      multiple?: false;
      /**
       * 受控字段/表单值；更新通过对应回调提交，保持声明类型。
       */
      modelValue: Id | null;
    }
  | {
      /**
       * 是否多选；默认 false。单选值为 ID/null，多选为 ID[]，不能混用。
       */
      multiple: true;
      /**
       * 受控字段/表单值；更新通过对应回调提交，保持声明类型。
       */
      modelValue: Id[];
    };

/** 使用 NoInfer 让 Id/Filters 只由 source 决定，拒绝错误模型将 Id 拓宽成联合类型。 */
export type ReferenceProps<Row, Id extends ReferenceId, F extends ReferenceFilters> = {
  /**
   * 参照数据源配置；提供稳定 key、行主键/名称、搜索和 ID 回显方法。创建对象本身不发请求。
   * @example
   * `source: provinceReference`
   */
  source: ReferenceSource<Row, Id, F>;

  /**
   * 每次请求使用的固定业务范围；根据当前 model/context 计算，与 source 的 filters 类型一致。
   * @example
   * `filters: ({ model, context }) => ({ organizationId: context.organizationId, parentId: model.provinceId, level: "city" })`
   */
  filters: NoInfer<F>;

  /**
   * 可读的用户/组织/权限隔离标识；从公共页面 context 取，不用显示标题或随机值。
   * @example
   * `scopeKey: ({ context }) => context.scopeKey`
   */
  scopeKey: string;
} & ReferenceModelProps<NoInfer<Id>>;

/** ID 异步回显状态；pending 未完成与 unavailable 已失效严格区分。 */
export interface ReferenceResolveState<Row, Id extends ReferenceId> {
  /**
   * 解析或提交对应的完整行数据；用于显示名称和额外字段回填，不直接作为保存 DTO。
   */
  items: readonly Row[];

  /**
   * 已明确失效/无权限/不存在的 ID；不能当作有效选择继续提交。
   */
  unavailableIds: readonly Id[];

  /**
   * 仍在异步回显中的 ID；尚未得到结果不等于已失效。
   */
  pendingIds: readonly Id[];
}
/** 参照错误事件；phase 定位搜索、回显或守卫阶段，error 需先缩窄类型。 */
export interface ReferenceError {
  /**
   * 当前生命周期阶段；依据联合字面量显示加载/失败/就绪界面，不手动变更。
   */
  phase: "suggest" | "search" | "resolve" | "guard";

  /**
   * 本次失败信息；无错误时为空值。unknown 类型需先判断再读取 message。
   */
  error: unknown;
}
/** MyReference 的公开事件参数说明，供模板事件悬停和调用方适配使用。 */
export type ReferenceEmits<Row, Id extends ReferenceId, Multiple extends boolean> = {
  /**
   * 已确认的参照 ID 值变更；单选为空时为 null，多选为空数组。
   * @example
   * `<MyReference v-model="form.customerId" />`
   */
  "update:modelValue": [value: ReferenceValue<Id, Multiple>];
  /**
   * 参照提交成功，提供新旧值、涉及记录及提交原因，可据此回填名称等关联字段。
   * @example
   * `<MyReference @commit="({ items }) => form.customerName = items[0]?.name ?? ''" />`
   */
  commit: [value: ReferenceCommit<Row, Id, Multiple>];
  /**
   * 组件完成已选 ID 的记录解析，用于同步展示或处理不可用记录。
   * @example
   * `<MyReference @resolve="({ unavailableIds }) => showUnavailable(unavailableIds)" />`
   */
  resolve: [value: ReferenceResolveState<Row, Id>];
  /**
   * 候选、搜索、解析或提交前校验失败；phase 用于区分失败环节。
   * @example
   * `<MyReference @error="({ phase, error }) => reportReferenceError(phase, error)" />`
   */
  error: [value: ReferenceError];
  /**
   * 选择弹窗打开或关闭。
   * @example
   * `<MyReference @open-change="(visible) => trackReferenceDialog(visible)" />`
   */
  "open-change": [value: boolean];
};
/** 参照输入外观和交互参数；只使用公开属性，禁止覆盖内部 DOM 样式。 */
export interface ReferenceInputProps<
  Row,
  Id extends ReferenceId,
  F extends ReferenceFilters,
  Multiple extends boolean = false,
> {
  /** 查看与前往新增的可选入口；省略保持原参照行为。
   * @example
   * `navigation: { create: "customer", view: id => ({ target: "customer", id }) }`
   */
  navigation?: ReferenceNavigation<Row, Id>;
  /**
   * 参照数据源，定义查询、解析、主键及展示列。
   * @example
   * `<MyReference :source="customerReference" ... />`
   */
  source: ReferenceSource<Row, Id, F>;
  /**
   * 已确认的参照主键值（v-model）。
   * @example
   * `<MyReference v-model="form.customerId" ... />`
   */
  modelValue: ReferenceValue<NoInfer<Id>, NoInfer<Multiple>>;
  /**
   * 查询/解析参照时附带的受控筛选条件。
   * @example
   * `<MyReference :filters="{ orgId }" ... />`
   */
  filters: NoInfer<F>;
  /**
   * 当前上下文的稳定标识，切换后会隔离候选与已选状态。
   * @example
   * `<MyReference scope-key="customer:edit" ... />`
   */
  scopeKey: string;
  /**
   * 是否多选；决定 modelValue 的单值或数组形态。
   * @example
   * `<MyReference multiple v-model="form.memberIds" ... />`
   */
  multiple?: Multiple & boolean;
  /**
   * 禁用全部交互与弹窗打开操作。
   * @example
   * `<MyReference :disabled="submitting" ... />`
   */
  disabled?: boolean;
  /**
   * 仅展示已选内容，不允许修改。
   * @example
   * `<MyReference readonly ... />`
   */
  readonly?: boolean;
  /**
   * 是否显示清空已选值的操作，默认 true。
   * @example
   * `<MyReference :clearable="false" ... />`
   */
  clearable?: boolean;
  /**
   * 输入框为空时的提示文字。
   * @example
   * `<MyReference placeholder="选择客户" ... />`
   */
  placeholder?: string;
  /**
   * 开始请求候选项前所需的最少输入字符数。
   * @example
   * `<MyReference :min-chars="2" ... />`
   */
  minChars?: number;
  /**
   * 候选查询的输入防抖时间（毫秒）。
   * @example
   * `<MyReference :debounce-ms="300" ... />`
   */
  debounceMs?: number;
  /**
   * 输入候选区最多显示的记录数。
   * @example
   * `<MyReference :suggest-limit="10" ... />`
   */
  suggestLimit?: number;
  /**
   * 多选时允许确认的最大记录数。
   * @example
   * `<MyReference multiple :max-selected="5" ... />`
   */
  maxSelected?: number;
  /**
   * 弹窗打开前的业务校验；返回不允许时取消打开。
   * @example
   * `<MyReference :before-open="checkCustomerPermission" ... />`
   */
  beforeOpen?: () => ReferenceAvailability | Promise<ReferenceAvailability>;
  /**
   * 提交选中项前的业务校验；返回不允许时保留当前已确认值。
   * @example
   * `<MyReference :before-commit="validateCustomer" ... />`
   */
  beforeCommit?: (
    commit: ReferenceCommit<Row, Id, Multiple>
  ) => ReferenceAvailability | Promise<ReferenceAvailability>;
}

/** 单选参照组件的类型别名；用于只允许 ID|null 的组合场景。 */
export type SingleReferenceProps<
  Row,
  Id extends ReferenceId,
  F extends ReferenceFilters,
> = ReferenceInputProps<Row, Id, F, false>;

/** 参照公开实例方法；调用方仅通过这些方法打开、关闭、聚焦或校验。 */
export interface ReferenceExpose {
  /**
   * 打开指定目标/参照；返回是否成功，失败或守卫拦截时为 false。
   */
  open: () => Promise<boolean>;

  /**
   * 关闭参照弹窗；放弃尚未确认的临时选择，不清空已提交值。
   */
  close: () => void;

  /**
   * 定位对应错误或聚焦输入控件；用于校验反馈，不修改业务数据。
   */
  focus: () => void;

  /**
   * 清空当前内容或校验提示；具体范围由此端口定义，参照清空仍会经过提交守卫。
   */
  clear: () => Promise<boolean>;

  /**
   * 重新加载参照数据；不自动更改选择值，用于手动刷新。
   */
  reload: () => void;

  /**
   * 按当前范围重新验证已选 ID；返回可用性，失败不能继续当作有效值保存。
   */
  validateSelection: () => Promise<ReferenceAvailability>;
}
