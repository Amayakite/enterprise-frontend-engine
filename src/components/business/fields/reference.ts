import { h, type Component } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import {
  checkReferenceResolve,
  referenceFilterKey,
} from "@/components/business/MyReference/contract";
import type {
  ReferenceSource,
  ReferenceId,
  ReferenceFilters,
  ReferenceValue,
  ReferenceCommit,
  ReferenceAvailability,
  ReferenceNavigation,
} from "@/components/business/MyReference/types";
import type { FieldEnvironment, FieldReference } from "./types";
import { cloneModel } from "./model";
import { referenceIds } from "@/components/business/MyReference/selection";
import ReferenceDisplay from "./ReferenceDisplay.vue";

/** 可复用参照定义；withMap 创建独立闭包，不修改共享 map。 */
export interface ConfiguredReference<
  Row,
  Id extends ReferenceId,
  F extends ReferenceFilters,
  Multiple extends boolean,
  M,
  C,
> extends FieldReference<ReferenceValue<Id, Multiple>, M, C> {
  /** 仅替换回写步骤；保留 source/filters/守卫/导航，清空仍调用此函数。
   * @example
   * `province.withMap(({ items }) => ({ provinceName: items[0]?.name ?? "" }))`
   */
  withMap: (
    map: NonNullable<ReferenceFieldOptions<Row, Id, F, Multiple, M, C>["map"]>
  ) => ConfiguredReference<Row, Id, F, Multiple, M, C>;
}
/** 参照工厂配置，数据源类型在 withMap 回调中保持推导。 */
export interface ReferenceFieldOptions<
  Row,
  Id extends ReferenceId,
  F extends ReferenceFilters,
  Multiple extends boolean,
  M,
  C,
> {
  /**
   * 参照数据源合同；提供稳定 key、行主键/名称、搜索和 ID 回显方法。创建对象本身不发请求。
   * @example
   * `source: provinceReference`
   */
  source: ReferenceSource<Row, Id, F>;

  /**
   * 是否多选；默认 false。单选值为 ID/null，多选为 ID[]，不能混用。
   */
  multiple?: Multiple;

  /**
   * 每次请求使用的固定业务范围；根据当前 model/context 计算，与 source 的 filters 类型一致。
   * @example
   * `filters: ({ model, context }) => ({ organizationId: context.organizationId, parentId: model.provinceId, level: "city" })`
   */
  filters: (env: FieldEnvironment<M, C>) => NoInfer<F>;

  /**
   * 可读的用户/组织/权限隔离标识；从公共页面 context 取，不用显示标题或随机值。
   * @example
   * `scopeKey: ({ context }) => context.scopeKey`
   */
  scopeKey: (env: FieldEnvironment<M, C>) => string;

  /**
   * 选择完成后的额外字段回填，返回 Partial<Model>；主 ID 由字段绑定处理，清空时应清除关联名称。
   * @example
   * `map: event => ({ provinceName: event.items[0]?.name ?? "" })`
   */
  map?: (commit: ReferenceCommit<Row, Id, Multiple>, env: FieldEnvironment<M, C>) => Partial<M>;

  /**
   * 打开前置检查；返回 { allowed: false, reason } 阻止打开，适合要求先选上级。
   * @example
   * `beforeOpen: ({ model }) => ({ allowed: !!model.provinceId, reason: "请先选择省份" })`
   */
  beforeOpen?: (
    env: FieldEnvironment<M, C>
  ) => ReferenceAvailability | Promise<ReferenceAvailability>;

  /**
   * 提交选择/清空前的异步守卫；允许返回 { allowed: true }，不要在此直接修改模型。
   */
  beforeCommit?: (
    commit: ReferenceCommit<Row, Id, Multiple>,
    env: FieldEnvironment<M, C>
  ) => ReferenceAvailability | Promise<ReferenceAvailability>;

  /**
   * 多选最多允许的项数；省略不加数量限制，建议正整数。
   * @example
   * `maxSelected: 10`
   */
  maxSelected?: number;

  /** 可选查看/前往新增；路由目标不属于数据 source。 */
  navigation?: ReferenceNavigation<Row, Id>;
}

/**
 * 将 API 参照源装配为字段编辑器，统一选择、回显、额外字段回填和提交校验。
 * @typeParam M 页面表单模型，决定 map 允许写回哪些字段。
 * @typeParam C 页面上下文，通常含 organizationId 和 scopeKey。
 * @returns 接收参照配置的函数；仅装配合同，不在创建时请求接口。
 * @remarks 选择提交后通过 commit 回写；回显/校验只读取数据，不直接修改模型。
 * @example
 * ```ts
 * const reference = createReferenceField<CustomerFormModel, CustomerPageContext>();
 * const provinceField = reference({ source: province,
 *   filters: ({ context }) => ({ organizationId: context.organizationId, level: "province", parentId: null }),
 *   scopeKey: ({ context }) => context.scopeKey });
 * ```
 */
export function createReferenceField<M, C = undefined>() {
  function build<
    Row,
    Id extends ReferenceId,
    F extends ReferenceFilters,
    Multiple extends boolean = false,
  >(
    options: ReferenceFieldOptions<Row, Id, F, Multiple, M, C>
  ): ConfiguredReference<Row, Id, F, Multiple, M, C> {
    return {
      withMap: (map) => build({ ...options, map }),
      display(value, env) {
        const ids = referenceIds(value as Id | Id[] | null);
        const filters = cloneModel(options.filters(env));
        const scope = JSON.stringify([options.scopeKey(env), referenceFilterKey(filters)]);
        return h(ReferenceDisplay, {
          owner: options.source,
          requestKey: JSON.stringify([scope, ids]),
          async load(context) {
            if (!ids.length) return "";
            const signal = context.signal;
            const result = await context.batch.run(options.source, scope, ids, async (allIds) => {
              const typedIds = allIds as Id[];
              return checkReferenceResolve(
                await options.source.resolve(typedIds, filters, { signal }),
                typedIds,
                options.source.getKey
              );
            });
            const items = ids.map((id) => {
              const row = result.items.find((row) => options.source.getKey(row) === id);
              if (!row || result.unavailableIds.includes(id)) throw new Error("记录不可用");
              return {
                id,
                label: options.source.getLabel(row),
                target: options.navigation?.view?.(id, row),
              };
            });
            return options.navigation?.view ? items : items.map((item) => item.label).join("、");
          },
        });
      },
      render(value, env, readonly, commit, presentation) {
        // Vue 的 h 重载不能保留泛型 SFC 的参数；类型擦除仅限这个已由上面合同约束的边界。
        return h(MyReference as Component, {
          source: options.source,
          navigation: options.navigation,
          modelValue: value,
          multiple: options.multiple,
          filters: options.filters(env),
          scopeKey: options.scopeKey(env),
          readonly,
          placeholder: presentation?.placeholder,
          maxSelected: options.maxSelected,
          beforeOpen: options.beforeOpen ? () => options.beforeOpen!(env) : undefined,
          beforeCommit: options.beforeCommit
            ? (event: ReferenceCommit<Row, Id, Multiple>) => options.beforeCommit!(event, env)
            : undefined,
          onCommit: (event: ReferenceCommit<Row, Id, Multiple>) =>
            commit(
              event.value,
              cloneModel(options.map?.(event, env) ?? {}),
              event.reason === "dependency-clear" ? "dependency" : "user"
            ),
        });
      },
      async validate(value, env, batch) {
        try {
          const ids = referenceIds(value as Id | Id[] | null);
          if (!ids.length) return { allowed: true };
          if (options.maxSelected !== undefined && ids.length > options.maxSelected)
            return { allowed: false, reason: `最多选择 ${options.maxSelected} 项` };
          const filters = cloneModel(options.filters(env));
          const result = await batch.run(
            options.source,
            JSON.stringify([options.scopeKey(env), referenceFilterKey(filters)]),
            ids,
            async (allIds) => {
              // batch 以 source 对象身份隔离，此处 ID 集合只可能来自同一个 source。
              const typedIds = allIds as Id[];
              return checkReferenceResolve(
                await options.source.resolve(typedIds, filters, {
                  signal: batch.signal ?? new AbortController().signal,
                }),
                typedIds,
                options.source.getKey
              );
            }
          );
          const valid = ids.every(
            (id) =>
              !result.unavailableIds.includes(id) &&
              result.items.some(
                (row) =>
                  options.source.getKey(row) === id &&
                  (options.source.selectable?.(row).allowed ?? true)
              )
          );
          return { allowed: valid, reason: valid ? undefined : "参照值已失效或不可选择" };
        } catch (error) {
          return {
            allowed: false,
            reason: error instanceof Error ? error.message : "参照校验失败",
          };
        }
      },
    };
  }
  return build;
}
