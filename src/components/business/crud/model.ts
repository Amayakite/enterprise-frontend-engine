import { cloneModel, cloneReadonlyModel } from "../fields/model";
import type { BusinessModuleContract, BusinessModuleConfig } from "./module";

/** 模块的已组合模型方法；输入/输出由模块类型定义关联，不要求继承类。 */
export type BusinessModel<T extends BusinessModuleContract> = BusinessModuleConfig<T>["model"];

/**
 * 常见整单模型的声明方式。业务只负责初始值、字段白名单及编辑 DTO 的差异。
 * @typeParam T 模块类型定义；例如 CustomerContract extends BusinessModuleContract。
 * @remarks 工厂负责隔离模型快照，不猜测后端字段、版本或响应类型。
 */
export interface BusinessModelOptions<T extends BusinessModuleContract> {
  /** 新增初始值工厂；每次调用后还会复制，防止多个页面共用数组。 */
  create: BusinessModel<T>["create"];
  /** 实体转换成视图模型；工厂复制转换结果，编辑不会污染接口快照。 */
  fromRecord: BusinessModel<T>["fromRecord"];
  /** 服务端实体主键；0 是有效值，不使用数组下标。 */
  getKey: BusinessModel<T>["getKey"];
  /**
   * 页面模型 → 新增整单 DTO。传入的是隔离副本，可以 trim/归一化。
   * @example
   * `toPayload: model => toCustomerPayload(model, children)`
   */
  toPayload: (model: T["Model"]) => T["Create"];
  /**
   * 编辑 DTO 的差异；第一个参数已完成公共白名单及子表转换，不需再调用 toPayload。
   * @example
   * `updatePayload: (payload, input) => ({ ...payload, version: input.baseline.version })`
   */
  updatePayload: (
    payload: T["Create"],
    input: Parameters<BusinessModel<T>["toUpdate"]>[0]
  ) => T["Update"];
  /** 保存回执 → 服务端实体；回执就是实体时填写 async record => record，否则显式回读。 */
  resolveSaved: BusinessModel<T>["resolveSaved"];
  /**
   * 替换指定公共步骤，其余保留默认实现。不是类方法重载，不使用继承的隐藏调用顺序。
   * @remarks 覆盖 create/fromRecord/toCreate/toUpdate 后由业务负责对应的快照隔离和 DTO 边界。
   * @example
   * `overrides: { toCreate: input => specialCreateAdapter(input.model) }`
   */
  overrides?: Partial<BusinessModel<T>>;
}

/**
 * 封装默认模型流程：初始值复制、回显复制、只读模型复制、公共保存转换和编辑差异。
 * @returns 可直接传给 module.model 的完整接口约定；没有共享响应式状态，不发接口请求。
 * @example
 * `model: children => defineBusinessModel<Contract>()({ create, fromRecord, getKey, toPayload, updatePayload, resolveSaved })`
 */
export function defineBusinessModel<T extends BusinessModuleContract>() {
  return (options: BusinessModelOptions<T>): BusinessModel<T> => ({
    create: (context) => cloneModel(options.create(context)),
    fromRecord: (entity, context) => cloneModel(options.fromRecord(entity, context)),
    getKey: options.getKey,
    toCreate: (input) => options.toPayload(cloneReadonlyModel<T["Model"]>(input.model)),
    toUpdate: (input) =>
      options.updatePayload(options.toPayload(cloneReadonlyModel<T["Model"]>(input.model)), input),
    resolveSaved: options.resolveSaved,
    ...options.overrides,
  });
}
