import type { FieldDefinition, FieldEnvironment, FormFieldOptions } from "../fields/types";
import { defineFields } from "../fields/normalize";
import type { CrudColumn } from "./types";
import type { QuerySchema, QueryValueEditor } from "../search/types";
import type { FIELD_QUERY_OPERATORS } from "./field-query";
import { withQueryInputs } from "../search/model";

/** 场景排序；省略时沿用字段数组顺序，数值小的靠前。 */
interface OrderedScene {
  /**
   * 当前场景的位置；仅需要与公共顺序不同时填写。
   * @example
   * `order: 0`
   */
  order?: number;
}

/**
 * 单一字段来源：控件与通用表单规则写一次，scenes 仅声明使用位置和差异。
 * @typeParam M 页面模型，不是保存 DTO；提交必须经过白名单适配。
 * @typeParam S API 查询接口约定；查询 key 可以与模型字段不同。
 * @example
 * ```ts
 * { key: "name", label: "名称", type: "text", form: { required: true },
 *   scenes: { list: { minWidth: 180 }, edit: { readonly: true }, detail: true } }
 * ```
 */
type BaseModuleField<M, C, S extends QuerySchema> = FieldDefinition<
  M,
  C,
  {
    /**
     * list/detail/query 默认不参加；add/edit 默认继承 form，false 显式关闭。
     * 对象是浅覆盖：rules 等数组整体替换，不做隐式拼接。
     */
    scenes: {
      /** 列配置；true 使用 key/label，宽度、格式和多级表头在此维护。 */
      list?:
        | boolean
        | (Omit<CrudColumn<M>, "key" | "label"> & {
            /**
             * 面向用户的中文显示文案；不用于接口值或缓存身份。
             * @example
             * `label: "客户名称"`
             */
            label?: string;
          } & OrderedScene);
      /** 新增表单差异；true 复用 form，false 不展示也不做该场景字段校验。 */
      add?: boolean | (FormFieldOptions<M, C> & OrderedScene);
      /** 编辑表单差异；不影响新增页的独立 model/controller。 */
      edit?: boolean | (FormFieldOptions<M, C> & OrderedScene);
      /** 详情格式/分组；默认复用字段类型及选项。 */
      detail?:
        | boolean
        | (OrderedScene & {
            /** 详情栅格跨度，默认 1；长地址/备注建议 3。 */
            span?: 1 | 2 | 3;
            /** 详情分组标题，省略使用默认分组；例如“状态与审计”。 */
            group?: string;
            /** 需按字段值类型缩窄，或通过 env.model 读取确定类型的属性。 */
            format?: (value: unknown, env: FieldEnvironment<M, C>) => string;
          });
      /**
       * 字段查询意图；省略则不参与查询。source: fields 时自动派生类型、选项与操作符。
       * @example
       * `query: { normal: true, advanced: true, keyword: true }`
       */
      query?: {
        /** 查询字段别名；默认复用当前 field.key，旧 schema 接法要求键已存在。 */
        key?: Extract<keyof S, string>;
        /**
         * 出现在普通查询中；默认 false，操作符默认取类型规则第一项。
         * @example
         * `normal: true`
         */
        normal?: boolean;
        /**
         * 出现在高级查询字段列表中；默认 false。
         * @example
         * `advanced: true`
         */
        advanced?: boolean;
        /**
         * 加入顶部统一关键词的 OR 搜索；仅 text/textarea 支持，默认 false。
         * @example
         * `keyword: true`
         */
        keyword?: boolean;
        /**
         * 罕见覆盖：整体替换类型默认操作符；首项为普通查询默认值，不能为空。
         * @example
         * `operators: ["eq"]`
         */
        operators?: readonly QuerySchema[string]["operators"][number][];
        /** 查询输入提示；省略由控件生成，与表单 placeholder 独立。 */
        placeholder?: string;
        /** 参照 ID 的运行时类型，默认 string；数字 ID 必须填 number，不自动转换 ID。 */
        valueType?: "string" | "number";
        /** 查询值编辑器；省略使用 schema 默认输入，参照推荐 createQueryReference。 */
        input?: QueryValueEditor;
      };
    };
  }
>;

/** 将编辑器类型映射为对应查询操作符，不要求业务重复声明字段类型。 */
type QueryKind<Type> = Type extends "text" | "textarea"
  ? "text"
  : Type extends "amount"
    ? "decimal"
    : Type extends "switch"
      ? "boolean"
      : Type extends "select" | "dict"
        ? "enum"
        : Type extends keyof typeof FIELD_QUERY_OPERATORS
          ? Type
          : never;

/** 按控件类型收窄 query 覆盖项；不支持自动查询的控件仍可用旧 schema/input 接法。 */
type TypedQueryField<F> = F extends {
  /** 字段控件的实际类型。 */
  type: infer Type;
}
  ? F & {
      /** 仅增加 query 类型约束，不改变其他场景。 */
      scenes: {
        /** 操作符从控件类型补全；非文本字段禁止声明 keyword: true。 */
        query?: {
          /** 覆盖默认操作符的完整非空列表；一般不填。 */
          operators?: readonly [
            (typeof FIELD_QUERY_OPERATORS)[QueryKind<Type>][number],
            ...(typeof FIELD_QUERY_OPERATORS)[QueryKind<Type>][number][],
          ];
          /** 文本字段参与统一关键词；其他类型只能 false 或省略。 */
          keyword?: Type extends "text" | "textarea" ? boolean : false;
        };
      };
    }
  : never;

/** 唯一字段配置；字段名、控件、值与查询操作符关联，所有场景从这里派生。 */
export type ModuleField<M, C, S extends QuerySchema> = TypedQueryField<BaseModuleField<M, C, S>>;

/**
 * 检查单一字段配置；返回值仍是普通只读配置，无请求或响应式副作用。
 * @example
 * `const fields = defineModuleFields<Form, Context, typeof schema>()([...]);`
 */
export function defineModuleFields<M, C, S extends QuerySchema>() {
  return (fields: readonly ModuleField<M, C, S>[]) => {
    defineFields<M, C>()(fields);
    return fields;
  };
}

/**
 * 一次派生列表、新增、编辑、详情字段及查询编辑器；不修改输入配置。
 * @remarks 不从可见字段推断保存 DTO，也不请求字典或维护持久缓存。
 * @example
 * `const views = compileModuleFields(fields, apiQuerySchema);`
 */
export function compileModuleFields<M, C, S extends QuerySchema>(
  fields: readonly ModuleField<M, C, S>[],
  schema: S,
  queryOnly: readonly string[] = []
) {
  defineFields<M, C>()(fields);
  /** 按各页面场景的 order 排字段，未指定顺序时保留业务声明顺序。 */
  const ordered = (scene: "list" | "add" | "edit" | "detail") =>
    fields
      .map((field, index) => ({ field, index }))
      .sort((a, b) => {
        const x = a.field.scenes[scene];
        const y = b.field.scenes[scene];
        return (
          (typeof x === "object" ? (x.order ?? a.index) : a.index) -
          (typeof y === "object" ? (y.order ?? b.index) : b.index)
        );
      })
      .map(({ field }) => field);
  /** 根据新增/编辑场景生成表单字段，合并共享输入规则与当前模式设置。 */
  const form = (mode: "add" | "edit"): readonly FieldDefinition<M, C>[] =>
    ordered(mode).flatMap((field) => {
      const scene = field.scenes[mode];
      const base = field.form || undefined;
      if (scene === false || (scene === undefined && !base)) return [];
      const options = { ...base, ...(typeof scene === "object" ? scene : {}) };
      if (options.modes && !options.modes.includes(mode)) return [];
      const result: FieldDefinition<M, C> = { ...field };
      result.form = { ...options, modes: [mode] };
      return [result];
    });
  /** 筛出开启列表显示的字段，按列表顺序生成列配置。 */
  const list = ordered("list").filter((field) => !!field.scenes.list);
  /** 将列表字段转换成表格列，保留显示格式、宽度和排序等设置。 */
  const columns: readonly CrudColumn<M>[] = list.map((field) => ({
    key: field.key,
    label: field.label,
    ...(typeof field.scenes.list === "object" ? field.scenes.list : {}),
  }));
  /** 生成开启详情显示的字段及其分组/跨度，不混入仅编辑时使用的字段。 */
  const detail: readonly FieldDefinition<M, C>[] = ordered("detail")
    .filter((field) => !!field.scenes.detail)
    .map((field) => {
      const result: FieldDefinition<M, C> = { ...field };
      result.detail =
        field.scenes.detail === true
          ? field.detail || true
          : {
              ...(typeof field.detail === "object" ? field.detail : {}),
              ...(typeof field.scenes.detail === "object" ? field.scenes.detail : {}),
            };
      return result;
    });
  /** 按查询字段名收集自定义输入组件，用于补到最终查询 schema。 */
  const inputs: Partial<Record<Extract<keyof S, string>, QueryValueEditor>> = {};
  /** 检查字段映射到查询参数后是否重名，防止一个输入覆盖另一个。 */
  const queryKeys = new Set<string>();
  for (const field of fields) {
    /** 当前字段声明的查询入口、参数名和自定义输入，没有配置就跳过。 */
    const query = field.scenes.query;
    if (!query) continue;
    /** 当前字段对应的查询参数名，允许通过 query.key 与表单字段名区分。 */
    const key = query.key ?? field.key;
    if (!Object.hasOwn(schema, key)) throw new Error(`未声明的查询字段：${key}`);
    if (queryKeys.has(key)) throw new Error(`重复查询映射：${key}`);
    queryKeys.add(key);
    if (query.input) Object.assign(inputs, { [key]: query.input });
  }
  for (const key of queryOnly) {
    if (!Object.hasOwn(schema, key)) throw new Error(`未声明的独立查询字段：${key}`);
    if (queryKeys.has(key)) throw new Error(`重复查询映射：${key}`);
    queryKeys.add(key);
  }
  /** 给查询白名单补上各字段的自定义输入，后续再继承静态字典并限制显示入口。 */
  const query = withQueryInputs(schema, inputs);
  // 静态字典只在字段声明一次，查询显示自动继承；不改变 API 运算符或值类型。
  for (const field of fields) {
    /** 当前字段对应的查询参数名，允许通过 query.key 与表单字段名区分。 */
    const key = field.scenes.query ? (field.scenes.query.key ?? field.key) : undefined;
    if (
      key &&
      field.type === "dict" &&
      typeof field.dict.code === "string" &&
      field.dict.valueType !== "preserve" &&
      query[key].kind === "enum"
    ) {
      Object.assign(query, {
        [key]: {
          ...query[key],
          dictionary: {
            code: field.dict.code,
            valueType: field.dict.valueType,
          },
        },
      });
    }
  }
  // 保留 API 的 AST 类型与白名单，仅隐藏不属于当前模块场景的查询入口。
  for (const key of Object.keys(query)) {
    if (!queryKeys.has(key)) Object.assign(query, { [key]: { ...query[key], entries: [] } });
  }
  return { list, columns, add: form("add"), edit: form("edit"), detail, query };
}
