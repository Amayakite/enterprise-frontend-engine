import { useCrudTableChild } from "@/composables/useCrudTableChild";
import type { CrudFormController } from "./types";
import type { FieldKey } from "../fields/types";
import type { CrudIssue } from "./types";

/** 主模型/请求中承载子表的数组字段；普通字符串等字段不能绑定子表。 */
export type ArrayModelKey<M> = {
  [K in FieldKey<M>]: M[K] extends readonly object[] ? K : never;
}[FieldKey<M>];

/**
 * 保存适配器按 DTO 数组字段接收绑定，不依赖主配置文件，防止循环引用。
 * @typeParam M 页面模型。
 * @typeParam DTO 包含子表数组的整单请求。
 * @example
 * `function toPayload(model: Form, children: AggregatePayloadBindings<Form, SaveDTO>) { ... }`
 */
export type AggregatePayloadBindings<M, DTO> = {
  [K in ArrayModelKey<DTO>]: {
    /** 目标 DTO 数组名；与该绑定的键一致。 */
    payloadKey: K;
    /** 从主模型取已登记的数组，并运行子表的白名单转换。 */
    toPayload: (model: M) => DTO[K];
  };
};

/** 模块组合器所需的最小绑定；具体子配置与精确 key 在工厂返回值中保留。 */
export interface AggregateBinding<M> {
  /** 按需登记聚合编辑端口；页面负责显示，省略时由页面自行登记。 */
  createBinding?: <Entity, Id extends string | number>(
    form: CrudFormController<M, Entity, Id>
  ) => unknown;
  /** 主表单数组字段，同时作为 section/child registration key。 */
  modelKey: ArrayModelKey<M>;
  /** 整单 DTO 内的数组字段，不要求与主模型字段同名。 */
  payloadKey: string;
  /** 子表分区/详情页签标题。 */
  title: string;
  /** 将子表多行规则转为可定位的主表 issue。 */
  validate: (model: M) => readonly CrudIssue<M>[];
}

/**
 * 在父模块声明子表归属；子配置不反向依赖父模型或父 config。
 * @typeParam M 主页面模型。
 * @typeParam DTO 整单保存请求。
 * @remarks 只支持 aggregate。不发独立子表请求；映射后的空数组仍需传给后端。
 * @example
 * ```ts
 * const bind = defineAggregateBinding<Form, SaveDTO>();
 * const lines = bind({ modelKey: "items", payloadKey: "details", config: itemConfig });
 * // 主 adapter 返回：{ ...master, [lines.payloadKey]: lines.toPayload(model) }
 * ```
 */
export function defineAggregateBinding<M extends object, DTO>() {
  return <
    const K extends ArrayModelKey<M>,
    const P extends ArrayModelKey<DTO>,
    Child extends {
      /** 子行草稿；省略不持久化未提交的行编辑。 */
      draft?: {
        /** 草稿结构版本，结构变化时递增。 */ version: number;
        /** 可恢复字段白名单，不含组件状态。 */ fields: readonly FieldKey<
          M[K] extends readonly (infer Row extends object)[] ? Row : never
        >[];
      };
      /**
       * 界面展示标题；通常填写业务中文名称，不作为稳定身份。
       */
      title: string;

      /**
       * 校验整个子表数组，返回错误文案集合；返回 [] 表示通过，不写入服务端。
       */
      validateRows: (rows: M[K]) => readonly string[];

      /**
       * 子表整单保存声明；当前只支持 aggregate，随主表提交而非独立写接口。
       */
      persistence: {
        /**
         * 子表保存模式；当前仅支持 aggregate，随主表整单保存。
         */
        mode: "aggregate";
        /**
         * 把子表行转换为接口白名单数组；返回值必须匹配父 DTO 中 payloadKey 的类型。
         */
        toPayload: (rows: M[K]) => DTO[P];
      };
    },
  >(options: {
    /**
     * 主模型的数组属性，也是 section 与子表注册 key；不可填字符串路径。
     * @example
     * `modelKey: "contacts"`
     */
    modelKey: K;
    /**
     * 整单 DTO 的数组属性，允许与 modelKey 不同；转换结果必须匹配该数组类型。
     * @example
     * `payloadKey: "contactDetails"`
     */
    payloadKey: P;
    /** 子表独立 config；由它提供 title、多行校验及 persistence.toPayload。 */
    config: Child;
  }) => {
    const { modelKey, payloadKey, config } = options;
    if (!modelKey.trim() || !payloadKey.trim() || !config.title.trim())
      throw new Error("主子表绑定的模型 key、DTO key 与标题不能为空");
    if (config.persistence.mode !== "aggregate") throw new Error("当前只支持 aggregate 整单保存");
    const rows = (model: M) => {
      if (!Array.isArray(model[modelKey])) throw new Error(`子表 ${modelKey} 必须是数组`);
      return model[modelKey];
    };
    return {
      ...options,
      createBinding<Entity, Id extends string | number>(form: CrudFormController<M, Entity, Id>) {
        // K 已约束为数组字段，仅在 TS 无法反向收窄条件类型的边界恢复关联。
        return useCrudTableChild<M, Entity, Id, K>(
          form,
          modelKey as K & (M[K] extends readonly object[] ? unknown : never),
          { draft: config.draft }
        );
      },
      title: config.title,
      read: rows,
      toPayload: (model: M): DTO[P] => config.persistence.toPayload(rows(model)),
      validate: (model: M): readonly CrudIssue<M>[] =>
        config.validateRows(rows(model)).map((message) => ({ section: modelKey, message })),
    };
  };
}
