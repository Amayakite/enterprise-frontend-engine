import type { RichTextProps } from "./rich-text";
import type { DeepReadonly, VNode } from "vue";
import type { FormItemRule } from "element-plus";
import type { FileInfo } from "@/api/file/types";
import type {
  ReferenceAvailability,
  ReferenceCondition,
} from "@/components/business/MyReference/types";

/**
 * 模型中可作为字段配置 key 的字符串属性名。
 *
 * @typeParam M 页面模型。
 * @example
 * `FieldKey<CustomerForm> // "name" | "status" | ...`
 */
export type FieldKey<M> = Extract<keyof M, string>;
/** 当前可见主字段分组；由 MyForm 计算，供调用方导航使用，不保存模型副本。 */
export interface FormVisibleGroup<M> {
  /** 当前连续分组首个可见字段键，用于定位；同名但不连续的分组保持独立。 */
  key: FieldKey<M>;
  /** 配置的 group 文案；首段未分组时为“基本信息”，后续未声明 group 的字段沿用前段。 */
  label: string;
  /** 此分组实际可见的字段键，按显示顺序排列；用于错误数量归属。 */
  fields: readonly FieldKey<M>[];
}
/**
 * 字段值变更来源；用于联动、脏状态和只读保护。
 *
 * - `user`：用户直接输入或选择，最常用。
 * - `dependency`：字段联动回填，可在受控只读场景下执行。
 * - `hydrate` / `reset`：实体加载或重置，不应触发业务副作用。
 * - `external`：调用方通过 applyPatch 注入值。
 */
export type ChangeReason = "user" | "external" | "hydrate" | "reset" | "dependency";
/**
 * 字段展示密度。
 *
 * @example
 * `density: "compact"` 用于常规后台表单；`"comfortable"` 用于宽松的详情或大屏表单。
 */
export type FieldDensity = "compact" | "comfortable";
/**
 * 省市区等地区记录的稳定 ID；保持后端原始 string/number 类型，不自行互转。
 * @example
 * `"310000"`、`110000`。
 */
export type RegionId = string | number;
/** 地区路径节点；包含稳定 ID 和展示名称，按省/市/区顺序用于回填。 */
export interface RegionOption {
  /** 当前层级地区 ID，例如 `"310000"`。 */
  id: RegionId;
  /** 当前层级地区名称，例如 `"上海市"`。 */
  name: string;
}
/**
 * 级联数据源既可映射为一次性路径接口，也可逐级请求 loadChildren。
 * filters 是业务范围，不承载用户选择的 parentId，避免两类条件混在一起。
 */
export interface RegionCascaderSource {
  /**
   * 地区层级深度；省市区通常填 `3`，仅省市可填 `2`。
   * @example
   * `depth: 3`
   */
  depth: number;
  /**
   * 按父级和层级加载候选地区。
   *
   * @param parentId 第一级传 null；之后传上一级的 ID。
   * @param level 从 0 开始的层级序号。
   * @param filters 固定业务范围，例如 `{ countryCode: "CN" }`。
   * @param signal 请求取消信号，接口请求应透传。
   * @example
   * ```ts
   * loadChildren: (parentId, level, filters, signal) => api.listRegions({ parentId, level, ...filters }, { signal })
   * ```
   */
  loadChildren: (
    parentId: RegionId | null,
    level: number,
    filters: unknown,
    signal?: AbortSignal
  ) => Promise<readonly RegionOption[]>;
  /**
   * 根据末级 ID 反查完整省/市/区路径；编辑回显需要时提供。
   * 未提供时组件只能展示已懒加载过的路径。
   * @example
   * `resolvePath: (id, filters, signal) => api.getRegionPath(id, filters, { signal })`
   */
  resolvePath?: (
    value: RegionId,
    filters: unknown,
    signal?: AbortSignal
  ) => Promise<readonly RegionOption[]>;
}
/**
 * 字段读取数据和判断条件时使用的参数。model 是当前表单数据，context 放组织等额外信息，mode 区分新增和编辑。
 *
 * @typeParam M 页面模型。
 * @typeParam C 页面业务上下文。
 * @example
 * `visible: ({ model, context }) => context.editable && !!model.customerId`
 */
export interface FieldEnvironment<M, C> {
  /** 当前模型的只读快照；条件函数不可直接修改它。 */
  model: Readonly<M>;
  /** 页面声明的业务上下文，例如组织、权限、字典范围。 */
  context: C;
  /** 当前表单模式；用于控制字段可见性、必填和只读规则。 */
  mode: "add" | "edit";
}
/**
 * 字段条件配置。常量适合固定规则，函数适合依赖模型或上下文的规则。
 * @example
 * `required: true`
 * @example
 * `visible: ({ model }) => model.type === "enterprise"`
 */
export type FieldCondition<M, C> = boolean | ((env: FieldEnvironment<M, C>) => boolean);
/** 单字段的表单布局、必填与校验策略；由统一字段引擎解释，不存页面状态。 */
export interface FormFieldOptions<M, C> {
  /**
   * 字段出现的表单模式；省略时新增、编辑都显示。
   * @example
   * `modes: ["add"]` 仅新增时填写邀请码。
   */
  modes?: readonly ("add" | "edit")[];
  /**
   * 是否渲染字段；推荐依赖 env.model/context 返回布尔值，不要在函数中改模型。
   * @example
   * `visible: ({ model }) => model.status === "active"`
   */
  visible?: FieldCondition<M, C>;
  /**
   * 是否可编辑；字段仍会展示。需要提示原因时配合 FieldBase.readonlyReason。
   * @example
   * `readonly: ({ mode }) => mode === "edit"`
   */
  readonly?: FieldCondition<M, C>;
  /**
   * 是否必填；推荐同时配置适合该字段的 rules，保证 UI 与提交校验一致。
   * @example
   * `required: ({ model }) => model.customerType === "company"`
   */
  required?: FieldCondition<M, C>;
  /**
   * Element Plus 校验规则；可传单条或数组。
   * @example
   * `rules: { min: 2, max: 50, message: "请输入 2~50 个字符", trigger: "blur" }`
   */
  rules?: FormItemRule | FormItemRule[];
  /**
   * 栅格跨度，取 1/2/3；推荐普通输入填 1，地址/备注等长内容填 2 或 3。
   * @example
   * `span: 2`
   */
  span?: 1 | 2 | 3;
  /**
   * 表单分组名称；与 MyCrudForm sections 的 key 对应，空字符串表示主区域。
   * @example
   * `group: "contact"`
   */
  group?: string;
}
/**
 * `reference` 字段的渲染、回显和提交校验接口约定。
 *
 * @typeParam V 字段保存的 ID 值类型。
 * @typeParam M 所属页面模型。
 * @typeParam C 页面业务上下文。
 * @remarks 使用 createReferenceField 创建；业务不要直接实现 render，以免丢失 ID/filters/回填关联。
 */
export interface FieldReference<V, M, C> {
  /**
   * 只读场景的自定义回显；省略时使用 render 的 readonly 模式。
   * @example
   * `display: (value) => h("span", value ?? "—")`
   */
  display?: (value: V, env: FieldEnvironment<M, C>) => VNode;
  /** 工厂闭包保存 Row/Id/Filters 的关联，只在 Vue 渲染边界统一为 VNode。 */
  /**
   * 渲染可编辑或只读参照控件；通常由 createReferenceField 生成。
   * commit 的 value 是主字段值，mapped 是应一起回写的名称/编码等字段。
   * @example
   * `reference: createReferenceField<CustomerForm>()({ source, filters, scopeKey, map })`
   */
  render: (
    value: V,
    env: FieldEnvironment<M, C>,
    readonly: boolean,
    commit: (value: V, mapped: Partial<M>, reason: ChangeReason) => void,
    presentation?: {
      /**
       * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
       * @example
       * `placeholder: "请输入客户名称"`
       */
      placeholder?: string;
    }
  ) => VNode;
  /**
   * 保存前校验已选 ID 是否仍存在且可选；batch 会合并同源请求。
   * @returns allowed 为 false 时阻止提交，reason 用于字段错误提示。
   */
  validate: (
    value: V,
    env: FieldEnvironment<M, C>,
    batch: ReferenceValidationBatch
  ) => Promise<ReferenceAvailability>;
}
/** 单轮参照校验请求合并端口；同源同范围 ID 去重，不能跨用户范围共用。 */
export interface ReferenceValidationBatch {
  /** 可选的批量请求取消信号。 */
  readonly signal?: AbortSignal;
  /**
   * 以 owner、key 和 ID 集合合并相邻校验请求。
   * @remarks 调用方只提供 resolve，不要自行缓存解析结果。
   */
  run: <T>(
    owner: object,
    key: string,
    ids: readonly (string | number)[],
    resolve: (ids: readonly (string | number)[]) => Promise<T>
  ) => Promise<T>;
}
interface FieldBase<M, C, K extends FieldKey<M>> {
  /**
   * 模型字段名；必须是 M 的真实 string key。
   * @example
   * `key: "customerName"`
   */
  key: K;
  /**
   * 界面标签；建议使用业务名词，不包含“请输入”等动作词。
   * @example
   * `label: "客户名称"`
   */
  label: string;
  /**
   * 控件为空时的提示；未提供时按字段 type 自动生成。
   * @example
   * `placeholder: "请输入统一社会信用代码"`
   */
  placeholder?: string;
  /**
   * 字段旁的补充说明；适合口径、单位或填写限制。
   * @example
   * `help: "金额以元为单位，最多两位小数"`
   */
  help?: string;
  /** 已知语义绑定校验；其它字符串只作为格式说明。 */
  formatHint?:
    | "email"
    | "mobile"
    | "phone"
    | "decimal"
    | "money"
    | "date"
    | "datetime"
    | "month"
    | "year"
    | (string & {});
  /**
   * 字段不可编辑时显示的业务原因；返回 undefined 表示不额外提示。
   * @example
   * `readonlyReason: ({ model }) => model.locked ? "已锁定，不能修改" : undefined`
   */
  readonlyReason?: (env: FieldEnvironment<M, C>) => string | undefined;
  /**
   * 表单展示与校验配置；传 false 可显式不在表单展示。
   * @example
   * `form: { required: true, span: 2 }`
   */
  form?: false | FormFieldOptions<M, C>;
  /**
   * 详情展示配置；true 使用默认展示，object 可设置分组、跨度与格式化。
   * @example
   * `detail: { group: "基本信息", span: 2 }`
   */
  detail?:
    | boolean
    | {
        /**
         * 占用的栅格列数，只允许 1/2/3；省略跟随默认布局，不超过页面列数。
         */
        span?: 1 | 2 | 3;

        /**
         * 详情分组名称；同名字段合并显示，省略进入默认分组。
         * @example
         * `group: "基本资料"`
         */
        group?: string;

        /**
         * 只改变展示文本，不修改模型/保存 DTO；收到字段值与页面上下文。
         * @example
         * `format: value => value == null ? "—" : String(value)`
         */
        format?: (value: M[K], env: FieldEnvironment<M, C>) => string;
      };
  /**
   * 列表展示配置；false 隐藏列，object 可设置宽度、排序和单元格格式化。
   * @example
   * `table: { minWidth: 160, sortable: true }`
   */
  table?:
    | false
    | {
        /**
         * 列的基础宽度（像素）；空间不足按表格规则滚动，空余空间由 MyTable 统一分配。
         * @example
         * `width: 120`
         */
        width?: number;

        /**
         * 列最小宽度（像素）；希望可伸展的文字列优先使用此项。
         * @example
         * `minWidth: 180`
         */
        minWidth?: number;

        /**
         * 单元格对齐方向；文字通常 left，金额通常 right，可选 center。
         */
        align?: "left" | "center" | "right";

        /**
         * 是否提供排序入口；默认不开启，后端仍须校验字段排序白名单。
         */
        sortable?: boolean;

        /**
         * 只改变展示文本，不修改模型/保存 DTO；收到字段值与页面上下文。
         * @example
         * `format: value => value == null ? "—" : String(value)`
         */
        format?: (value: M[K], env: FieldEnvironment<M, C>) => string;

        /**
         * 自定义单元格插槽名；必须以 column- 开头，并在页面提供同名插槽。
         */
        slot?: `column-${string}`;
      };
}
type Accept<V, Expected, Config> = [V] extends [Expected] ? Config : never;
type DictionaryShape<V> = [V] extends [string[]]
  ? {
      /**
       * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
       */
      type: "checkbox";
      /**
       * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
       */
      valueType: "string";
    }
  : [V] extends [number[]]
    ? {
        /**
         * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
         */
        type: "checkbox";
        /**
         * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
         */
        valueType: "number";
      }
    : [V] extends [(string | number)[]]
      ? {
          /**
           * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
           */
          type: "checkbox";
          /**
           * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
           */
          valueType: "preserve";
        }
      : [V] extends [string | null]
        ? {
            /**
             * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
             */
            type?: "select" | "radio";
            /**
             * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
             */
            valueType: "string";
          }
        : [V] extends [number | null]
          ? {
              /**
               * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
               */
              type?: "select" | "radio";
              /**
               * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
               */
              valueType: "number";
            }
          : {
              /**
               * 联合类型判别字段；只能填写此分支的字面量值，由类型提示约束。
               */
              type?: "select" | "radio";
              /**
               * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
               */
              valueType: "preserve";
            };
type Editor<V, M, C> =
  | Accept<
      V,
      string | number | null,
      {
        /**
         * 枚举选择；模型值应与 options.value 类型一致，空值建议使用 null。
         * @example
         * `{ type: "select", options: [{ label: "启用", value: "enabled" }] }`
         */
        type: "select";
        /** 可选项；value 必须与字段模型值类型一致。 */
        options: readonly {
          /**
           * 面向用户的中文显示文案；不用于接口值或缓存身份。
           * @example
           * `label: "客户名称"`
           */
          label: string;
          /**
           * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
           */
          value: NonNullable<V>;
          /**
           * 禁用当前选项/控件；默认不禁用，业务权限仍由后端确认。
           */
          disabled?: boolean;
        }[];
        /** 清空时写回的值；推荐可空字段填写 null。 */
        emptyValue?: V;
        /** 下拉控件选项；常用 clearable、filterable、placeholder。 */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;
          /**
           * 是否显示清空入口；清空值由 emptyValue/模型接口约定决定。
           */
          clearable?: boolean;
          /**
           * 是否允许在下拉中筛选选项；不是后端远程搜索开关。
           */
          filterable?: boolean;
        };
      }
    >
  | Accept<
      V,
      string | null,
      {
        /**
         * 普通文本、长文本或图片 URL 字段。
         * @example
         * `{ type: "text", props: { maxlength: 50 } }`
         * @example
         * `{ type: "textarea", props: { rows: 4, maxlength: 500 } }`
         */
        type: "text" | "textarea" | "image";
        /** 输入控件参数；textarea 推荐明确 rows，文本推荐明确 maxlength。 */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;
          /**
           * 输入最大字符数；正整数，金额含符号/小数点；仍需服务端校验。
           */
          maxlength?: number;
          /**
           * 长文本初始可见行数；通常 3～5，不限制实际内容长度。
           * @example
           * `rows: 4`
           */
          rows?: number;
        };
      }
    >
  | Accept<
      V,
      string | null,
      {
        /** 富文本 HTML 字符串；编辑器按需加载，空标签不通过必填校验。
         * @example
         * `{ type: "rich", props: { height: "320px", maxlength: 2000, readonlyDisplay: "html" } }`
         */
        type: "rich";
        /** 富文本专属选项；省略使用 240px、默认提示和纯文本详情。 */
        props?: RichTextProps;
      }
    >
  | Accept<
      V,
      string | null,
      {
        /** 金额在模型和 DTO 中始终保持十进制字符串，避免经过 number。 */
        type: "amount";
        /** 清空时写回的字符串/null；推荐与模型定义一致。 */
        emptyValue?: V;
        /**
         * 金额输入规则；模型和提交 DTO 始终保留十进制字符串。
         * @example
         * `props: { precision: 2, min: "0", max: "999999.99", currency: "¥" }`
         */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;

          /**
           * 输入最大字符数；正整数，金额含符号/小数点；仍需服务端校验。
           */
          maxlength?: number;

          /**
           * 允许的小数位数；非负整数，整数数量通常 0，金额通常 2。
           * @example
           * `precision: 2`
           */
          precision?: number;

          /**
           * 允许的最小值；金额必须传十进制字符串，普通 number 字段传数字，省略不限制下界。
           */
          min?: string;

          /**
           * 允许的最大值；与 min 保持相同类型，省略不限制上界。
           */
          max?: string;

          /**
           * 金额是否允许负数；应按业务明确配置，退款等场景可开启。
           */
          allowNegative?: boolean;

          /**
           * 金额显示前缀/符号；不参与提交值，不执行汇率转换。
           * @example
           * `currency: "¥"`
           */
          currency?: string;
        };
      }
    >
  | Accept<
      V,
      number | null,
      {
        /**
         * 数值输入；适合数量、排序等非金额数值。
         * @example
         * `{ type: "number", props: { min: 0, max: 999, precision: 0 } }`
         */
        type: "number";

        /**
         * 用户清空时回写的值；必须符合模型类型，单值推荐 null，数组推荐 []。
         */
        emptyValue?: V;

        /**
         * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
         */
        props?: {
          /**
           * 允许的最小值；金额必须传十进制字符串，普通 number 字段传数字，省略不限制下界。
           */
          min?: number;
          /**
           * 允许的最大值；与 min 保持相同类型，省略不限制上界。
           */
          max?: number;
          /**
           * 每次增减的步长；通常 1，须与精度和业务数量单位匹配。
           */
          step?: number;
          /**
           * 允许的小数位数；非负整数，整数数量通常 0，金额通常 2。
           * @example
           * `precision: 2`
           */
          precision?: number;
        };
      }
    >
  | Accept<
      V,
      string | null,
      {
        /**
         * 单值日期输入；模型保存格式化字符串而非 Date。
         * @example
         * `{ type: "date" }`
         * @example
         * `{ type: "month", props: { placeholder: "请选择结算月份" } }`
         */
        type: "date" | "datetime" | "month" | "year";

        /**
         * 用户清空时回写的值；必须符合模型类型，单值推荐 null，数组推荐 []。
         */
        emptyValue?: V;

        /**
         * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
         */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;
        };
      }
    >
  | Accept<
      V,
      string[] | null,
      {
        /**
         * 日期范围；模型值为 `[start, end]` 字符串数组，建议先用 isValidDateRange 校验。
         * @example
         * `{ type: "dateRange", emptyValue: null, props: { placeholder: "选择有效期" } }`
         */
        type: "dateRange";

        /**
         * 用户清空时回写的值；必须符合模型类型，单值推荐 null，数组推荐 []。
         */
        emptyValue?: V;

        /**
         * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
         */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;
        };
      }
    >
  | Accept<
      V,
      boolean,
      {
        /**
         * 布尔开关；模型必须是 boolean，不要用 0/1 代替。
         * @example
         * `{ type: "switch", props: { activeText: "启用", inactiveText: "停用" } }`
         */
        type: "switch";

        /**
         * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
         */
        props?: {
          /**
           * 布尔开关为 true 时的说明。
           * @example
           * `activeText: "启用"`
           */
          activeText?: string;
          /**
           * 布尔开关为 false 时的说明。
           * @example
           * `inactiveText: "停用"`
           */
          inactiveText?: string;
        };
      }
    >
  | Accept<
      V,
      string | number | null | (string | number)[],
      {
        /**
         * 字典字段；值类型和单/多选形态由模型自动约束。
         * @example
         * `{ type: "dict", emptyValue: null, dict: { code: "customer_status", valueType: "string" } }`
         */
        type: "dict";

        /**
         * 用户清空时回写的值；必须符合模型类型，单值推荐 null，数组推荐 []。
         */
        emptyValue: V;
        /** 字典数据源及值类型；动态 code 使用 env 计算。 */
        dict: {
          /**
           * 后端统一字典的 key，不是选项值；动态函数从字段环境取值。
           * @example
           * `code: "customer_status"`
           */
          code: string | ((env: FieldEnvironment<M, C>) => string);
        } & DictionaryShape<V>;

        /**
         * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
         */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;
        };
      }
    >
  | Accept<
      V,
      string[],
      {
        /**
         * 多图片 URL 列表；模型值为 string[]。
         * @example
         * `{ type: "images" }`
         */
        type: "images";

        /**
         * 此编辑器不接受通用 props；请使用专属配置或公开插槽，不透传私有参数。
         */
        props?: never;
      }
    >
  | Accept<
      V,
      FileInfo[],
      {
        /**
         * 文件记录列表；模型值为 FileInfo[]。
         * @example
         * `{ type: "files" }`
         */
        type: "files";

        /**
         * 此编辑器不接受通用 props；请使用专属配置或公开插槽，不透传私有参数。
         */
        props?: never;
      }
    >
  | Accept<
      V,
      RegionId | null,
      {
        /** 最后一层 ID 是字段值；map 显式回写省/市/区的 ID、名称等业务字段。 */
        type: "region";
        /**
         * 地区数据源、固定筛选和回填逻辑。
         * @example
         * `region: { source: regionSource, filters: () => ({ countryCode: "CN" }), map: (items) => ({ provinceName: items[0]?.name ?? "" }) }`
         */
        region: {
          /**
           * 省市区级联数据源；选择全量树或逐层加载接口约定，禁止在 map 中请求下级数据。
           */
          source: RegionCascaderSource;

          /**
           * 级联数据源的固定业务筛选；从字段环境读取，结构须与 source.load/树接口一致。
           */
          filters: (env: FieldEnvironment<M, C>) => unknown;

          /**
           * 按省/市/区顺序接收完整选择路径，返回额外字段补丁；清空时数组为空，应同步清空名称。
           * @example
           * `map: items => ({ provinceName: items[0]?.name ?? "" })`
           */
          map: (items: readonly RegionOption[]) => Partial<M>;
        };

        /**
         * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
         */
        props?: {
          /**
           * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
           * @example
           * `placeholder: "请输入客户名称"`
           */
          placeholder?: string;
        };
      }
    >
  | {
      /**
       * 业务参照字段；用 createReferenceField 创建 reference。
       * @example
       * `{ type: "reference", reference: customerField }`
       */
      type: "reference";

      /**
       * 通过 createReferenceField 创建的字段适配器；统一渲染、回显、守卫与校验，不直接放 API 函数。
       */
      reference: FieldReference<V, M, C>;

      /**
       * 此编辑器不接受通用 props；请使用专属配置或公开插槽，不透传私有参数。
       */
      props?: never;
    }
  | {
      /**
       * 完全自定义字段；必须在 MyForm/页面提供 field-<key> 插槽。
       * @example
       * `{ type: "custom" }`
       */
      type: "custom";

      /**
       * 此编辑器不接受通用 props；请使用专属配置或公开插槽，不透传私有参数。
       */
      props?: never;
    };
/**
 * 页面字段的唯一配置接口约定，同时驱动表单、详情、表格、校验和联动。
 *
 * @typeParam M 页面模型；字段 key 与值类型由此自动关联。
 * @typeParam C 页面业务上下文。
 * @typeParam Extension 公共组合器扩展的元数据；普通业务无需提供第三个参数。
 * @example
 * ```ts
 * const fields = defineFields<CustomerForm, CustomerContext>()([
 *   { key: "name", label: "客户名称", type: "text", form: { required: true }, detail: true },
 * ]);
 * ```
 */
export type FieldDefinition<M, C = undefined, Extension = unknown> = {
  [K in FieldKey<M>]: FieldBase<M, C, K> & Editor<M[K], M, C> & Extension;
}[FieldKey<M>];

/**
 * 声明式字段联动；读取字段必须列在 watch，写入字段必须列在 writes。
 *
 * @remarks 显式写集合用于预检循环与阻止隐藏副作用；不要在 apply 内修改 env.model。
 * @example
 * `{ watch: ["provinceId"], writes: ["cityId"], apply: () => ({ cityId: null }) }`
 */
export interface FieldLink<M, C = undefined> {
  /**
   * 联动依赖的字段 key；这些字段变更才会重新计算 apply。
   * @example
   * `watch: ["provinceId"]`
   */
  watch: readonly FieldKey<M>[];
  /** apply 的写集合必须显式声明，用于预检环路及运行期防止隐藏写入。 */
  writes: readonly FieldKey<M>[];
  /**
   * 依赖值失效时需清空的字段；通常填写下游参照/名称字段。
   * @example
   * `clear: ["cityId", "cityName"]`
   */
  clear?: readonly FieldKey<M>[];
  /**
   * 返回要合并进模型的补丁；不要原地修改 env.model，也不要写入未声明 writes 的字段。
   * @example
   * `apply: ({ model }) => ({ cityName: model.cityId ? "已选择" : "" })`
   */
  apply?: (
    env: FieldEnvironment<M, C> & {
      /**
       * 本次模型变更来源，沿用 ChangeReason；用于区分用户修改、载入/重置与依赖清空。
       */
      reason: ChangeReason;
    }
  ) => Partial<M>;
}
/** 字段原子更新事件；包含修改原因与部分模型变化，用于联动和受控回写。 */
export interface FormPatch<M> {
  /** 本次变更涉及的字段补丁；不包含完整模型。 */
  changes: Partial<M>;
  /** 变更来源，用于区分用户输入、回填、加载和重置。 */
  reason: ChangeReason;
  /** 主触发字段；批量 patch 或外部更新时可以省略。 */
  field?: FieldKey<M>;
}
/** 用户确认后的原子字段事务；参照 ID/map 和同步 links 已完成，不包含中间输入态。 */
export interface FormChange<M> {
  /** 最初触发的字段 key；联动字段列在 changes 中。
   * @example
   * if (event.field === "provinceId") console.info(event.model);
   */ field: FieldKey<M>;
  /** user 为用户确认；dependency 为参照依赖清空，不代表另一轮用户输入。 */
  reason: "user" | "dependency";
  /** 本次字段交互开始前的只读模型快照。 */ previous: DeepReadonly<M>;
  /** 确认时已完成回填和同步联动的只读模型快照。 */ model: DeepReadonly<M>;
  /** 相比 previous 实际发生变化的字段；含回填和联动，不含等值字段。 */
  changes: DeepReadonly<Partial<M>>;
}
/** 字段校验汇总结果；每项错误关联模型字段，供表单定位展示。 */
export interface FieldValidationResult<M> {
  /** 所有已校验字段是否通过。 */
  valid: boolean;
  /** 校验过程中模型变化时为 true；调用方应重新校验而非提交。 */
  stale?: boolean;
  /** 字段级错误列表；field 可用于 focusField 定位。 */
  errors: {
    /**
     * 模型字段名；从类型提示选择实际存在的 key，用于配置/错误定位。
     */
    field: FieldKey<M>;
    /**
     * 面向用户的结果或错误说明；填写可理解的业务原因，避免原始堆栈。
     */
    message: string;
  }[];
}
/**
 * MyForm 暴露给 CRUD 容器或页面的受控操作。
 *
 * @remarks hydrate 用于加载实体，applyPatch 用于字段联动；两者不可互相替代。
 * @example
 * `const formRef = ref<MyFormExpose<CustomerForm>>(); await formRef.value?.validate();`
 */
export interface MyFormExpose<M> {
  /** 使用完整实体转换后的模型覆盖表单，清空旧校验与联动状态。 */
  hydrate: (model: M) => void;
  /** 使用 createInitialModel 返回值重置表单。 */
  reset: () => void;
  /** 合并部分字段并标记指定变更来源。 */
  applyPatch: (patch: Partial<M>, reason?: ChangeReason) => void;
  /** 校验当前全部可见字段。 */
  validate: () => Promise<FieldValidationResult<M>>;
  /** 只校验给定字段；适合分区或保存前的局部预检。 */
  validateFields: (keys: readonly FieldKey<M>[]) => Promise<FieldValidationResult<M>>;
  /** 清除全部或指定字段的 UI 校验状态。 */
  clearValidate: (keys?: readonly FieldKey<M>[]) => void;
  /**
   * 显示当前模型已完成的外部校验错误，替换原提示，不再次执行规则或请求。
   * 调用方须保证结果未过期；隐藏/不存在的字段被忽略，传空数组清空。
   * @example
   * `formRef.value?.setErrors(result.errors);`
   */
  setErrors: (errors: FieldValidationResult<M>["errors"]) => void;
  /** 将焦点定位到指定字段的第一个可交互控件。 */
  focusField: (key: FieldKey<M>) => void;
}
/** 传统字段搜索配置；查询模型 Q 与编辑模型分离。 */
export type SearchField<Q, C = undefined> = FieldDefinition<Q, C> & {
  /**
   * 参照字段的查询能力；声明允许的运算符与是否开放高级查询。
   */
  search: {
    /**
     * 是否提供高级查询入口；只控制 UI 能力，不替代 API 查询白名单。
     */
    advanced?: boolean;
    /**
     * 当前条件运算符；从字段允许的 operators 选择，between 传两个边界，in 传非空数组。
     */
    operator: ReferenceCondition["operator"];
  };
};

/** MyFormField 需要的参数。在 MyForm 插槽中调用 field(key) 获取，即可显示该字段并保留校验和回写，不要逐项手动构造。 */
export interface FormFieldBinding<M, C, Value = M[FieldKey<M>]> {
  /** 原字段配置，保留类型、规则与参照定义。 */ field: FieldDefinition<NoInfer<M>, NoInfer<C>>;
  /** 原表单实时模型与业务上下文，不直接修改。 */ env: FieldEnvironment<M, C>;
  /** 当前字段值，类型由 field(key) 推导。 */ value: Value;
  /** 归一化可见性；隐藏字段不显示控件。 */ visible: boolean;
  /** 归一化只读状态，包含调用方限制。 */ readonly: boolean;
  /** 当前字段校验错误，undefined 表示无错误。 */ error?: string;
  /** 整体回填版本，变更时重建内部控件。 */ entityVersion: number;
  /** 回写字段及参照映射；默认 user 来源，不直接提交到服务器。 */ update: (
    value: NoInfer<Value>,
    mapped?: Partial<NoInfer<M>>,
    reason?: ChangeReason
  ) => void;
  /** 确认本次交互已完成；文本失焦或参照回填后调用。 */ commit: () => void;
  /** 登记显示实例并返回卸载清理；重复显示同一字段会报错。 */ register: () => () => void;
}
