import { compileFieldQuery } from "./field-query";
import { emptyAppliedQuery } from "../search/model";
import type { QuerySchema } from "../search/types";
import type { BusinessPageOptions } from "./page";
import type { BatchIdentity } from "./batch";
import type { FieldLink } from "../fields/types";
import { cloneReadonlyModel } from "../fields/model";
import type { AggregateBinding } from "./aggregate";
import { compileModuleFields } from "./module-fields";
import type { ModuleField } from "./module-fields";
import { defineCrudConfig, validateCrudKeys } from "./config";
import type { CrudListConfig, CrudFormConfig, CrudDetailConfig, CrudNavigation } from "./types";

/**
 * 模块的命名合同，替代容易错位的长串位置泛型。
 * @remarks Model 是字段共享的页面视图模型；Entity/保存 DTO 保持 API 所有权。
 * @example
 * ```ts
 * type Contract = { Model: CustomerModel; Entity: CustomerRecord; Id: string;
 *   Schema: typeof schema; Scope: CustomerScope; Query: SearchDTO;
 *   Create: SaveDTO; Update: UpdateDTO; Result: CustomerRecord; Context: PageContext };
 * ```
 */
export interface BusinessModuleContract {
  /** 页面统一字段模型；响应有差异时显式适配，不能用它直接代替保存 DTO。 */
  Model: object;
  /** 详情接口实体，用于基线、版本与保存后回填。 */
  Entity: object;
  /** 后端主键的真实类型；number 的 0 也有效，不强转为 string。 */
  Id: string | number;
  /** 查询组件合同；自动 fields 模式填 QuerySchema，旧 schema 模式填 typeof schema。 */
  Schema: QuerySchema;
  /** 固定组织/数据范围，不与用户输入的查询条件混合。 */
  Scope: unknown;
  /** 列表请求 DTO，由 views.list.toQuery 生成。 */
  Query: unknown;
  /** 新增整单 DTO，包含主表白名单和子表数组。 */
  Create: unknown;
  /** 编辑整单 DTO；有乐观锁时包含版本。 */
  Update: unknown;
  /** 保存回执；可能是实体，也可能需 resolveSaved 再读详情。 */
  Result: unknown;
  /** 当前页面上下文，例如组织与访问范围 key。 */
  Context: unknown;
}
/** 模块列表控制器配置，保留查询、范围与模型类型关联。 */
export type List<T extends BusinessModuleContract> = CrudListConfig<
  T["Model"],
  T["Id"],
  T["Schema"],
  T["Scope"],
  T["Query"],
  T["Context"]
>;
/** 模块表单配置，关联页面模型、实体与保存 DTO。 */
export type Form<T extends BusinessModuleContract> = CrudFormConfig<
  T["Model"],
  T["Entity"],
  T["Id"],
  T["Create"],
  T["Update"],
  T["Result"],
  T["Context"]
>;
/** 模块详情配置，关联实体、页面模型和主键类型。 */
export type Detail<T extends BusinessModuleContract> = CrudDetailConfig<
  T["Entity"],
  T["Model"],
  T["Id"],
  T["Context"]
>;

/**
 * 标准 CRUD 模块唯一配置入口；简单只读模块仍可使用 defineCrudConfig。
 * @remarks 配置描述能力，createRuntime 只装配合同；控制器仍在页面各自创建。
 */
export interface BusinessModuleConfig<T extends BusinessModuleContract> {
  /** 统一页面上下文适配；纯函数，不发请求。
   * @example
   * `context: base => ({ ...base, organizationId: "org-a" })`
   */
  context?: (base: {
    /** 当前组织。 */
    organizationId: string;
    /** 身份隔离范围。 */
    scopeKey: string;
  }) => T["Context"];
  /** 路由 ID 的显式转换；统一页面必填，字符串 ID 原样返回。
   * @example
   * `parseId: value => value`
   */
  parseId?: (value: string) => T["Id"];
  /** 批量标识映射；按钮、权限与业务规则由 index/useBatchActions 声明。 */
  batch?: BatchIdentity<T["Model"]>;
  /** 标准路由页的组织、路径与展示约定；由 useBusinessPage 读取，纯配置模块可省略。 */
  page?: BusinessPageOptions<
    T["Context"] extends {
      /**
       * 从页面上下文提取组织类型；用于约束 page 的固定值或组织 getter。
       */
      organizationId: infer O extends string;
    }
      ? O
      : string
  >;
  /** 稳定身份与显示名。已有模块 key 不随重构更名，避免丢失列偏好和草稿。 */
  meta: {
    /** 稳定、可读的身份；新模块推荐 base.customer，旧模块重构保留原 key。 */
    key: string;
    /** 模块中文名；不用于生成缓存身份。 */
    title: string;
    /** 后端统一批量接口的组件码，不是显示名，必须与后端约定。 */
    componentKey?: string;
  };
  /**
   * API 适配入口；所有请求沿用 CrudRequestContext，必须透传 signal。
   * @remarks create/update 可同时适配到后端 saveMasterDetail，URL 与外壳只在 API 层处理。
   */
  api: {
    /** 接收 Query DTO，返回 { list: Model[], total }；接口行不同就在此转换。 */
    list: List<T>["request"];
    /** 接收实体 ID 和请求上下文，返回 Entity；不要在此改页面状态。 */
    detail: Form<T>["load"];
    /** 新增整单写入，只调用一次聚合接口；子表不单独再请求。 */
    create: Form<T>["create"];
    /** ID 与编辑 DTO 一起提交；请求结果未知时不能自行重复写入。 */
    update: Form<T>["update"];
  };
  /**
   * 默认模型、实体回显、主键和保存白名单。toUpdate 可从 baseline 取得版本。
   * @example
   * `model: { create: createForm, fromRecord: toForm, getKey: record => record.id, ... }`
   */
  model: {
    /** 每次返回全新模型（包括空子表数组），不能返回可变单例。 */
    create: Form<T>["createInitial"];
    /** Entity → Model；应隔离可编辑数组与原始快照。 */
    fromRecord: Form<T>["toModel"];
    /** 从服务端实体提取 ID，用于保存后回填与跳转。 */
    getKey: Form<T>["getKey"];
    /** 只从 input.model 取白名单；用子表绑定组合 DTO，不按界面可见性猜测。 */
    toCreate: Form<T>["toCreate"];
    /** 编辑态保证 baseline 非空，可读取 input.baseline.version；不改基线。 */
    toUpdate: Form<T>["toUpdate"];
    /** 保存已提交后的回填步骤，失败只重试此步骤，不再次调用写接口。 */
    resolveSaved: Form<T>["resolveSaved"];
  };
  /** 唯一字段数组；list/add/edit/detail 均自动派生，不再维护三份字段定义。 */
  fields: readonly ModuleField<T["Model"], T["Context"], T["Schema"]>[];
  /** 字段联动；只写模型更新规则，不在此请求或创建状态。 */
  links?: readonly FieldLink<T["Model"], T["Context"]>[];
  /** 查询来源：新模块使用 source: fields，旧模块可继续显式 schema/initial。 */
  query:
    | (List<T>["query"] & {
        /** 仅查询、不属于实体的字段，例如 keyword；不要重复登记 fields.scenes.query 的 key。 */
        standalone?: readonly Extract<keyof T["Schema"], string>[];
      })
    | (QuerySchema extends T["Schema"]
        ? {
            /**
             * 从 fields.scenes.query 自动生成查询，初始为空，不需要额外 schema 或 keyword 字段。
             * @example
             * `query: { source: "fields" }`
             */
            source: "fields";
          }
        : never);
  /**
   * 父模型到整单 DTO 的绑定注册；子表字段和行校验继续归 children/<name>/config.ts。
   * @example
   * `children: { contacts: contactsBinding, addresses: addressesBinding }`
   */
  children: Readonly<Record<string, AggregateBinding<T["Model"]>>>;
  /** 场景级策略。字段差异写 fields.scenes，不在这里重复传 fields/columns。 */
  views: {
    /** 列表策略：分页、排序、scope、查询转换和动作；fields/columns 自动派生。 */
    list: Omit<List<T>, "request" | "fields" | "columns" | "query" | "actions"> & {
      /** 动作可依赖当前页面导航；不能捕获另一页面 controller。 */
      actions?: (navigation: CrudNavigation<T["Id"]>) => List<T>["actions"];
    };
    /** 新增/编辑共用的权限、草稿和生命周期；字段差异写 scenes.add/edit。 */
    form: Omit<
      Form<T>,
      | "fields"
      | "sections"
      | "childKeys"
      | "createInitial"
      | "load"
      | "toModel"
      | "toCreate"
      | "toUpdate"
      | "create"
      | "update"
      | "resolveSaved"
      | "getKey"
    >;
    /** 详情页额外策略；省略仍派生详情字段与子表页签。 */
    detail?: Pick<Detail<T>, "beforeOpen" | "afterOpen" | "summary"> & {
      /** 根据本页面导航生成详情动作；通常复用列表动作，仅覆盖删除后的跳转。 */
      actions?: (navigation: CrudNavigation<T["Id"]>) => Detail<T>["actions"];
    };
  };
}

/**
 * 定义标准业务模块，编译字段一次，按页面装配 CRUD 合同。
 * @typeParam T 用命名合同关联页面、实体、查询和保存类型。
 * @returns 原配置及 createRuntime；原 children 的具体配置和字面量 key 保留。
 * @remarks 不产生响应式单例、网络请求或缓存。每页仍独立 useCrudForm/useCrudList。
 * @example
 * ```ts
 * export const customerModule = defineBusinessModule<Contract>()({ meta, api, model,
 *   fields, query, children, views });
 * const config = customerModule.createRuntime(navigation, "edit");
 * const controller = useCrudForm(config.form, options);
 * ```
 */
export function defineBusinessModule<T extends BusinessModuleContract>() {
  return <const Children extends BusinessModuleConfig<T>["children"]>(
    config: Omit<BusinessModuleConfig<T>, "children" | "model"> & {
      /**
       * 在这里直接登记主数组与整单 DTO 的关系，子表行字段仍由独立 config 维护。
       * @example
       * `children: { contacts: bindChild({ modelKey: "contacts", payloadKey: "contacts", config: contactConfig }) }`
       */
      children: Children;
      /**
       * 直接传模型配置，或用工厂读取当前 children 后装配模型。
       * @example
       * `model: children => defineBusinessModel<Contract>()({ ... })`
       */
      model:
        | BusinessModuleConfig<T>["model"]
        | ((children: Children) => BusinessModuleConfig<T>["model"]);
    }
  ) => {
    if (!config.meta.key.trim() || !config.meta.title.trim())
      throw new Error("模块身份/标题不能为空");
    const automatic = "source" in config.query ? compileFieldQuery(config.fields) : undefined;
    // 自动模式只允许合同 Schema 为 QuerySchema（见 query 的条件类型）；
    // 因此这里恢复泛型身份，不将未校验的请求断言为业务 DTO。
    const querySchema = (
      "schema" in config.query ? config.query.schema : automatic!.schema
    ) as T["Schema"];
    const queryInitial =
      "initial" in config.query ? config.query.initial : emptyAppliedQuery<T["Schema"]>();
    const compiled = compileModuleFields(
      config.fields,
      querySchema,
      "standalone" in config.query
        ? config.query.standalone
        : automatic && Object.hasOwn(automatic.schema, "keyword")
          ? ["keyword"]
          : []
    );
    const children = Object.values(config.children);
    const model = typeof config.model === "function" ? config.model(config.children) : config.model;
    for (const key of ["modelKey", "payloadKey"] as const) {
      if (new Set(children.map((child) => child[key])).size !== children.length)
        throw new Error(`子表 ${key} 重复，不能覆盖同一个字段`);
    }
    const sections = children.map((child) => ({ key: child.modelKey, label: child.title }));
    const listBase: List<T> = {
      ...config.views.list,
      actions: undefined,
      fields: compiled.list,
      columns: compiled.columns,
      query: { schema: compiled.query, initial: queryInitial },
      toQuery: (request, context) =>
        config.views.list.toQuery(
          automatic
            ? { ...request, where: automatic.expand(request.where) as typeof request.where }
            : request,
          context
        ),
      request: config.api.list,
    };
    const createForm = (mode: "add" | "edit"): Form<T> => ({
      ...config.views.form,
      fields: compiled[mode],
      sections,
      childKeys: children.map((child) => child.modelKey),
      createInitial: model.create,
      load: config.api.detail,
      toModel: model.fromRecord,
      toCreate: model.toCreate,
      toUpdate: model.toUpdate,
      create: config.api.create,
      update: config.api.update,
      getKey: model.getKey,
      resolveSaved: model.resolveSaved,
      validate: async (input) => {
        const model = cloneReadonlyModel<T["Model"]>(input.model);
        const issues = children.flatMap((child) => child.validate(model));
        const master = await config.views.form.validate?.(input);
        if (master && !master.valid) issues.push(...master.issues);
        return issues.length || (master && !master.valid)
          ? { valid: false, issues }
          : { valid: true };
      },
    });
    const detailBase: Detail<T> = {
      summary: config.views.detail?.summary,
      beforeOpen: config.views.detail?.beforeOpen,
      afterOpen: config.views.detail?.afterOpen,
      load: config.api.detail,
      toModel: model.fromRecord,
      fields: compiled.detail,
      tabs: sections,
    };
    const forms = { add: createForm("add"), edit: createForm("edit") };
    // 与实例无关的合同只检查一次；动作工厂保留到对应场景首次读取时执行。
    defineCrudConfig({ key: config.meta.key, list: listBase, form: forms.add, detail: detailBase });
    defineCrudConfig({ key: config.meta.key, form: forms.edit });
    /**
     * 按需装配当前页面合同；同一 runtime 的场景配置复用，不创建 controller 或请求。
     * @param navigation 当前路由实例的导航函数，仅对应场景动作工厂会读取。
     * @param mode 表单场景，默认 add；编辑页传 edit。
     * @returns 独立表单配置及延迟装配的列表、详情；静态字段配置只读复用。
     * @example
     * const runtime = customerModule.createRuntime(navigation, "edit");
     */
    const createRuntime = (navigation: CrudNavigation<T["Id"]>, mode: "add" | "edit" = "add") => {
      let list: List<T> | undefined;
      let detail: Detail<T> | undefined;
      const form: Form<T> = { ...forms[mode] };
      return {
        key: config.meta.key,
        navigation,
        form,
        get list(): List<T> {
          if (!list) {
            const actions = config.views.list.actions?.(navigation);
            validateCrudKeys(
              config.meta.key,
              (actions ?? []).map((action) => action.key),
              "动作 key"
            );
            list = { ...listBase, actions };
          }
          return list;
        },
        get detail(): Detail<T> {
          if (!detail) {
            const actions = config.views.detail?.actions?.(navigation);
            validateCrudKeys(
              config.meta.key,
              (actions ?? []).map((action) => action.key),
              "详情动作 key"
            );
            detail = { ...detailBase, actions };
          }
          return detail;
        },
      };
    };
    // 仅参与推导，不创建运行时状态。
    const marker: {
      /** 模块命名合同；业务不读写。 */ readonly __contract?: T;
    } = {};
    return { ...config, model, createRuntime, ...marker };
  };
}
