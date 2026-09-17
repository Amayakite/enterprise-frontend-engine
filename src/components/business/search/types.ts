import type { VNode } from "vue";
import type { PageResult } from "@/types/http";
/** 草稿输入是未校验值；自定义输入不绕过 applyQueryDraft 的统一校验。 */
export interface QueryValueEditor {
  /**
   * 渲染自定义查询值输入控件。
   * @remarks 自定义控件只写草稿 value，最终仍会经过 applyQueryDraft 校验。
   * @example
   * `input: { render: ({ value, change }) => h(MySelector, { modelValue: value, "onUpdate:modelValue": change }) }`
   */
  render: (props: {
    /** 当前草稿值，类型为 unknown，控件需按字段语义自行解析。 */
    value: unknown;
    /** 当前操作符是否要求多值，例如 in/notIn。 */
    multiple: boolean;
    /** 查询面板忙碌时禁止更新。 */
    disabled: boolean;
    /** 查询面板自动传递的访问范围；独立使用编辑器时可省略，并由数据源提供范围。 */
    scopeKey?: string;
    /** 将新的草稿值回写给 QueryPanel。 */
    change: (value: unknown) => void;
  }) => VNode;
}
/**
 * 查询条件出现的位置。
 * - `quick`：顶部快捷条件，推荐放名称、编码等高频项。
 * - `normal`：普通查询面板。
 * - `advanced`：可嵌套逻辑分组，适合复杂组合条件。
 */
export type QueryEntry = "quick" | "normal" | "advanced";
type EmptyOperator = "isEmpty" | "isNotEmpty";
type EqualityOperator = "eq" | "ne";
type OrderedOperator = EqualityOperator | "gt" | "gte" | "lt" | "lte" | "between";
type MembershipOperator = EqualityOperator | "in" | "notIn";
interface QueryFieldBase {
  /** 界面显示名称，例如“客户名称”。 */
  label: string;
  /**
   * 条件可出现的位置；至少填写一个。
   * @example
   * `entries: ["quick", "normal"]`
   */
  entries: readonly QueryEntry[];
  /** 值输入框提示；省略时由组件按字段类型生成。 */
  placeholder?: string;
  /** 特殊值输入控件；仅在标准 text/number/date/enum 不够用时提供。 */
  input?: QueryValueEditor;
}
/**
 * 单个查询字段定义；kind 决定值类型和可用 operators。
 * @example
 * `{ label: "客户名称", kind: "text", entries: ["quick"], operators: ["contains"] }`
 * @example
 * `{ label: "创建日期", kind: "date", entries: ["normal"], operators: ["between", "gte", "lte"] }`
 */
export type QueryField = QueryFieldBase &
  (
    | {
        /**
         * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
         */
        kind: "text";

        /**
         * 该字段允许的运算符白名单；只声明后端支持的运算，不能为显示方便扩大范围。
         */
        operators: readonly (
          | EqualityOperator
          | "contains"
          | "notContains"
          | "startsWith"
          | "endsWith"
          | EmptyOperator
        )[];
      }
    | {
        /**
         * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
         */
        kind: "number" | "decimal" | "date" | "datetime";

        /**
         * 该字段允许的运算符白名单；只声明后端支持的运算，不能为显示方便扩大范围。
         */
        operators: readonly (OrderedOperator | EmptyOperator)[];
      }
    | {
        /**
         * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
         */
        kind: "boolean";
        /**
         * 该字段允许的运算符白名单；只声明后端支持的运算，不能为显示方便扩大范围。
         */
        operators: readonly (EqualityOperator | EmptyOperator)[];
      }
    | {
        /**
         * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
         */
        kind: "enum";

        /**
         * 枚举选项集合；label 用于展示，value 必须与查询/模型真实类型一致。
         */
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
          value: string | number;
        }[];

        /**
         * 字典驱动的枚举选项来源；code 为字典 key，valueType 明确字符串或数字。
         */
        dictionary?: {
          /**
           * 后端统一字典的 key，不是选项值；动态函数从字段环境取值。
           * @example
           * `code: "customer_status"`
           */
          code: string;
          /**
           * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
           */
          valueType: "string" | "number";
        };

        /**
         * 该字段允许的运算符白名单；只声明后端支持的运算，不能为显示方便扩大范围。
         */
        operators: readonly (MembershipOperator | EmptyOperator)[];
      }
    | {
        /**
         * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
         */
        kind: "reference";

        /**
         * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
         */
        valueType: "string" | "number";

        /**
         * 该字段允许的运算符白名单；只声明后端支持的运算，不能为显示方便扩大范围。
         */
        operators: readonly (MembershipOperator | EmptyOperator)[];
      }
  );
/**
 * 结构化查询字段配置；key 决定条件字段名与排序白名单的候选来源。
 * @example
 * `const schema = { name: { label: "名称", kind: "text", entries: ["quick"], operators: ["contains"] } } as const satisfies QuerySchema;`
 */
export type QuerySchema = Readonly<Record<string, QueryField>>;
type ValueOf<F extends QueryField> = F extends {
  /**
   * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
   */
  kind: "number";
}
  ? number
  : F extends {
        /**
         * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
         */
        kind: "boolean";
      }
    ? boolean
    : F extends {
          /**
           * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
           */
          kind: "enum";
          /**
           * 枚举选项集合；label 用于展示，value 必须与查询/模型真实类型一致。
           */
          options: readonly {
            /**
             * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
             */
            value: infer V;
          }[];
        }
      ? V
      : F extends {
            /**
             * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
             */
            kind: "reference";
            /**
             * 值类型约束：string/number 必须匹配模型；支持 preserve 的场景保留原始类型，不猜测转换。
             */
            valueType: "number";
          }
        ? number
        : string;
type Operand<O, V> = O extends EmptyOperator
  ? {
      /**
       * 当前条件运算符；从字段允许的 operators 选择，between 传两个边界，in 传非空数组。
       */
      operator: O;
      /**
       * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
       */
      value?: never;
    }
  : O extends "between"
    ? {
        /**
         * 当前条件运算符；从字段允许的 operators 选择，between 传两个边界，in 传非空数组。
         */
        operator: O;
        /**
         * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
         */
        value: readonly [V, V];
      }
    : O extends "in" | "notIn"
      ? {
          /**
           * 当前条件运算符；从字段允许的 operators 选择，between 传两个边界，in 传非空数组。
           */
          operator: O;
          /**
           * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
           */
          value: readonly [V, ...V[]];
        }
      : {
          /**
           * 当前条件运算符；从字段允许的 operators 选择，between 传两个边界，in 传非空数组。
           */
          operator: O;
          /**
           * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
           */
          value: V;
        };
/** 根据字段 schema 推导的已校验条件；值形态随 operator 变化。 */
export type QueryCondition<S extends QuerySchema> = {
  [K in Extract<keyof S, string>]: {
    /**
     * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
     */
    kind: "condition";
    /**
     * 客户端查询节点唯一 ID；用于删除、错误定位和渲染 key，不是后端实体 ID。
     */
    id: string;
    /**
     * 模型字段名；从类型提示选择实际存在的 key，用于配置/错误定位。
     */
    field: K;
  } & Operand<S[K]["operators"][number], ValueOf<S[K]>>;
}[Extract<keyof S, string>];
/** 已校验的 AND/OR 查询组；子节点可以是条件或嵌套组。 */
export interface QueryGroup<S extends QuerySchema> {
  /** 固定为 group，用于与条件节点区分。 */
  kind: "group";
  /** 客户端节点唯一 ID，用于删除、错误定位和渲染 key。 */
  id: string;
  /** 子条件的连接关系。 */
  operator: "and" | "or";
  /** 已应用分组至少有一个子节点；草稿分组可暂时为空。 */
  children: readonly [QueryNode<S>, ...QueryNode<S>[]];
}
/** 查询条件树节点联合；kind 区分组与单条件。 */
export type QueryNode<S extends QuerySchema> = QueryCondition<S> | QueryGroup<S>;
/** 已校验、可转换为 API 请求的查询条件；不要手动混入 QueryDraft。 */
export interface AppliedQuery<S extends QuerySchema> {
  /**
   * 快捷查询条件集合；应用前为可编辑草稿，应用后为已校验条件。
   */
  quick: readonly QueryCondition<S>[];

  /**
   * 普通查询面板条件集合；空条件应由查询校验器归一化。
   */
  normal: readonly QueryCondition<S>[];

  /**
   * 是否提供高级查询入口；只控制 UI 能力，不替代 API 查询白名单。
   */
  advanced: QueryGroup<S> | null;
}
/** 编辑态允许未完成输入；必须经 S2 校验，不能当作已应用条件发送。 */
export interface QueryDraftCondition<S extends QuerySchema> {
  /**
   * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
   */
  kind: "condition";

  /**
   * 客户端查询节点唯一 ID；用于删除、错误定位和渲染 key，不是后端实体 ID。
   */
  id: string;

  /**
   * 模型字段名；从类型提示选择实际存在的 key，用于配置/错误定位。
   */
  field: Extract<keyof S, string> | null;

  /**
   * 当前条件运算符；从字段允许的 operators 选择，between 传两个边界，in 传非空数组。
   */
  operator: string | null;

  /**
   * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
   */
  value: unknown;
}
/** 高级查询的可编辑组；可包含未填完的条件，应用前必须统一校验。 */
export interface QueryDraftGroup<S extends QuerySchema> {
  /**
   * 查询字段/节点的类型判别值；使用此分支字面量，让值与运算符保持类型关联。
   */
  kind: "group";

  /**
   * 客户端查询节点唯一 ID；用于删除、错误定位和渲染 key，不是后端实体 ID。
   */
  id: string;

  /**
   * 组内逻辑关系：and 要求全部子项满足，or 要求任一子项满足。
   */
  operator: "and" | "or";

  /**
   * 查询组内的条件/子组；按 operator 的 and/or 组合，禁止循环引用。
   */
  children: (QueryDraftCondition<S> | QueryDraftGroup<S>)[];
}
/** 编辑中的查询草稿，允许不完整输入；必须经 applyQueryDraft 才能发送。 */
export interface QueryDraft<S extends QuerySchema> {
  /**
   * 快捷查询条件集合；应用前为可编辑草稿，应用后为已校验条件。
   */
  quick: QueryDraftCondition<S>[];

  /**
   * 普通查询面板条件集合；空条件应由查询校验器归一化。
   */
  normal: QueryDraftCondition<S>[];

  /**
   * 是否提供高级查询入口；只控制 UI 能力，不替代 API 查询白名单。
   */
  advanced: QueryDraftGroup<S> | null;
}
/** QueryPanel 的公开事件合同，供调用方获得模板事件参数提示。 */
export type QueryApplyReason = "apply" | "remove" | "clear" | "reset";
/** 查询面板事件合同；草稿变化不等于已应用查询，宿主分别处理。 */
export type QueryPanelEmits<S extends QuerySchema> = {
  /**
   * 已应用的查询条件变更；值已通过查询组件校验。
   * @example
   * `<QueryPanel v-model="appliedQuery" />`
   */
  "update:modelValue": [value: AppliedQuery<S>];
  /**
   * 用户确认、移除、清空或重置条件后触发；reason 表示触发来源。
   * @example
   * `<QueryPanel @apply="(query, reason) => load(query, reason)" />`
   */
  apply: [value: AppliedQuery<S>, reason: QueryApplyReason];
  /**
   * 用户请求按当前已应用条件重新加载列表；不携带查询参数，宿主应使用当前 modelValue。
   * @example
   * `<QueryPanel @refresh="reload" />`
   */
  refresh: [];
  /**
   * 查询编辑草稿变更；可能包含尚未完成、未校验的输入，不能直接作为 API 查询条件。
   * @example
   * `<QueryPanel :draft="draft" @update:draft="draft = $event" />`
   */
  "update:draft": [value: QueryDraft<S>];
};
/** 查询校验错误；nodeId 定位控件，message 给用户反馈。 */
export interface QueryIssue {
  /**
   * 失败的查询节点 ID；与草稿节点 id 对应，用于将错误定位到输入控件。
   */
  nodeId: string;

  /**
   * 面向用户的结果或错误说明；填写可理解的业务原因，避免原始堆栈。
   */
  message: string;
}
/** 查询应用结果联合；成功提供 applied/where，失败提供 issues。 */
export type QueryApplyResult<S extends QuerySchema> =
  | {
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: true;
      /**
       * 已校验并实际用于请求的查询条件；不同于用户尚在编辑的 draft。
       */
      applied: AppliedQuery<S>;
      /**
       * 校验后的查询树；null 表示没有用户条件。unknown 输入必须先解析，不能直接拼 SQL。
       */
      where: QueryGroup<S> | null;
    }
  | {
      /**
       * 校验是否通过；false 时读取对应 issues/errors，不把网络失败视为通过。
       */
      valid: false;
      /**
       * 校验失败明细；包含定位信息与提示文案，成功分支不需要填写。
       */
      issues: readonly QueryIssue[];
    };
/** 固定数据范围及其身份 key；范围变化时取消旧请求并重置查询。 */
export interface QueryScope<Scope> {
  /**
   * 用户/组织/权限上下文的稳定版本，不是服务端授权凭据。
   * @example
   * `key: "org:1:user:u-42"`
   */
  key: string;
  /** 实际固定范围值，toQuery 会将其适配进业务 API DTO。 */
  value: Readonly<Scope>;
}
/** 固定权限/组织 scope 与用户查询 where 的请求外壳；两者不能相互覆盖。 */
export interface QueryEnvelope<S extends QuerySchema, Scope> {
  /**
   * 固定组织/权限范围；与用户 where 分开传递，用户查询不能覆盖它。
   */
  scope: QueryScope<Scope>;

  /**
   * 校验后的查询树；null 表示没有用户条件。unknown 输入必须先解析，不能直接拼 SQL。
   */
  where: QueryGroup<S> | null;
}
/** 分页查询标准请求；页码从 1 开始，排序必须经过白名单验证。 */
export interface QueryPageRequest<S extends QuerySchema, Scope> extends QueryEnvelope<S, Scope> {
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
  sort: {
    /**
     * 当前对象的稳定标识；与所属动作、字段、分区或子表注册项对应，不能用展示文案替代。
     */
    key: Extract<keyof S, string>;
    /**
     * 排序方向：asc 升序、desc 降序；取消排序请把整个 sort 设为 null。
     */
    order: "asc" | "desc";
  } | null;
}
/**
 * useSearchQuery 的数据源合同。
 *
 * @typeParam Row 列表行类型。
 * @typeParam S 查询 schema。
 * @typeParam Scope 固定查询范围类型，例如组织/权限上下文。
 * @remarks request 必须响应 AbortSignal；组件卸载或范围变化时会取消过期请求。
 */
export interface SearchQuerySource<
  Row,
  S extends QuerySchema,
  Scope,
  Sort = QueryPageRequest<S, Scope>["sort"],
> {
  /** 查询字段定义。 */
  schema: S;
  /** 已应用初始条件；省略时使用空条件。 */
  initial?: AppliedQuery<S>;
  /** 每页默认条数，推荐 10、20、50 或 100，默认 20。 */
  pageSize?: number;
  /** 初始排序；字段 key 应由业务 API 的排序白名单约束。 */
  initialSort?: NoInfer<Sort>;
  /** 返回当前固定范围；key 变化会取消旧请求并自动重置/刷新。 */
  scope: () => QueryScope<Scope>;
  /**
   * 请求当前页数据；必须透传 context.signal 并返回标准 PageResult。
   * @example
   * `request: (query, { signal }) => api.getPage(query, { signal })`
   */
  request: (
    query: Omit<QueryPageRequest<S, Scope>, "sort"> & {
      /**
       * 排序字段和方向；null 表示不指定用户排序，字段须属于 API 排序白名单。
       * @example
       * `sort: { key: "code", order: "asc" }`
       */
      sort: Sort | null;
    },
    context: {
      /**
       * 请求取消信号；必须传到底层 API，取消等待不代表服务端事务回滚。
       */
      signal: AbortSignal;
    }
  ) => Promise<PageResult<Row>>;
}
