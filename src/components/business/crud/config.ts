import type { QuerySchema } from "@/components/business/search/types";
import type { CrudConfig } from "./types";

/**
 * 定义并在开发期校验一个模块的 CRUD 总配置。
 *
 * @typeParam Row 列表行类型。
 * @typeParam Entity 服务端详情实体。
 * @typeParam Model 页面编辑模型。
 * @typeParam Id 实体稳定主键。
 * @remarks 只校验配置合同与重复 key；不请求接口，也不替代后端 DTO 校验。
 * @example
 * `export default defineCrudConfig<CustomerRow, Customer, CustomerForm, string, CustomerSchema, Scope, QueryDTO, CreateDTO, UpdateDTO, SaveResult, Context>({ key: "base.customer", ... })`
 */
export function defineCrudConfig<
  Row,
  Entity,
  Model,
  Id extends string | number,
  S extends QuerySchema,
  Scope,
  QueryDTO,
  CreateDTO,
  UpdateDTO,
  SaveResult,
  C,
>(
  config: CrudConfig<
    Row,
    Entity,
    Model,
    Id,
    S,
    Scope,
    QueryDTO,
    CreateDTO,
    UpdateDTO,
    SaveResult,
    C
  >
) {
  if (!config.key.trim()) throw new Error("CRUD 模块 key 不能为空");
  const unique = (values: readonly string[], label: string) => {
    if (values.some((value) => !value.trim()) || new Set(values).size !== values.length)
      throw new Error(`${config.key}：${label}为空或重复`);
  };
  const functions = (value: object, keys: readonly string[]) => {
    for (const key of keys)
      if (typeof Reflect.get(value, key) !== "function")
        throw new Error(`${config.key}：缺少 ${key}`);
  };
  if (config.list) {
    functions(config.list, ["getKey", "scope", "toQuery", "request"]);
    unique(
      config.list.columns.map((column) => column.key),
      "列 key"
    );
    unique(
      (config.list.actions ?? []).map((action) => action.key),
      "动作 key"
    );
    if (![10, 20, 50, 100].includes(config.list.pageSize ?? 20))
      throw new Error(`${config.key}：不支持的默认页大小`);
  }
  if (config.form) {
    functions(config.form, [
      "createInitial",
      "load",
      "toModel",
      "toCreate",
      "toUpdate",
      "create",
      "update",
      "resolveSaved",
      "getKey",
    ]);
    unique(
      config.form.fields.map((field) => field.key),
      "表单字段"
    );
    unique(
      (config.form.sections ?? []).map((section) => section.key),
      "分区 key"
    );
  }
  if (config.detail) {
    functions(config.detail, ["load", "toModel"]);
    unique(
      config.detail.fields.map((field) => field.key),
      "详情字段"
    );
    unique(
      (config.detail.actions ?? []).map((action) => action.key),
      "详情动作 key"
    );
    unique(
      (config.detail.tabs ?? []).map((tab) => tab.key),
      "详情页签 key"
    );
    if (config.detail.tabs?.some((tab) => tab.key === "main"))
      throw new Error("main 是主信息保留页签");
  }
  return {
    ...config,
    list: config.list
      ? { pageSize: 20, selection: "none" as const, actions: [], ...config.list }
      : undefined,
  };
}

/**
 * 开发期诊断未声明的 CRUD 扩展槽。
 *
 * @remarks 仅 DEV 输出 console.warn；不会阻止渲染或修改 slot。
 * @example
 * `diagnoseCrudSlots("MyCrudForm", slots, ["footer", "section-contact"])`
 */
export function diagnoseCrudSlots(owner: string, slots: object, allowed: readonly string[]) {
  if (!import.meta.env.DEV) return;
  for (const key of Object.keys(slots))
    if (!allowed.includes(key)) console.warn(`[${owner}] 未声明的插槽：${key}`);
}
