import { computed, shallowRef, watch } from "vue";
import type { DeepReadonly, Ref } from "vue";
import { useCrudActions } from "./useCrudActions";
import { invalidateView } from "./useViewInvalidation";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import { combineQuery } from "@/components/business/search/model";
import { serializeStableKey } from "@/utils/identity";
import type { AppliedQuery, QuerySchema } from "@/components/business/search/types";
import type {
  CrudAction,
  CrudListConfig,
  CrudListController,
} from "@/components/business/crud/types";
import type {
  BatchIdentity,
  BatchCommand,
  BatchController,
  BatchExecutor,
} from "@/components/business/crud/batch";
import type { BatchRequest, BatchResult } from "@/api/common/batch";

/**
 * index 级批量装配：复用 CRUD 确认、权限、单飞、快照复查与刷新，不逐行请求。
 * @remarks 无选择时仅 allowQuery 命令允许操作整个已应用查询，草稿/当前页不能冒充全部结果。
 * 统一响应未知时禁止本实例再次写入；应先核实后端，不做自动重试。
 * @example
 * `const batch = useBatchActions({ module: customerModule, config: config.list, list, context: () => context.value, commands, request: executeBatch });`
 */
export function useBatchActions<
  Row,
  Id extends string | number,
  S extends QuerySchema,
  Scope,
  Query,
  C,
>(options: {
  /** 模块稳定 key 和后端组件码；componentKey 缺失时禁用，不猜测后端名称。 */
  module: { meta: { key: string; componentKey?: string }; batch?: BatchIdentity<Row> };
  /** 当前列表合同，复用范围和查询 DTO 适配。 */
  config: CrudListConfig<Row, Id, S, Scope, Query, C>;
  /** 当前页面列表控制器。 */
  list: CrudListController<Row, Id, S>;
  /** 当前组织/权限环境，不传全局路由实例。 */
  context: () => DeepReadonly<C>;
  /** index 自己维护的动作规则，不登记进 config.views.list.actions。 */
  commands: readonly BatchCommand<Row>[];
  /** 一次批量请求的适配器；默认不猜测接口地址。 */
  request: BatchExecutor<Query>;
  /** 可选共享交互锁；列表同时使用它，防止批量期间执行行动作。 */
  lock?: Ref<boolean>;
  /** 覆写 config 的 ID/编码映射；普通模块不需要。 */
  identity?: BatchIdentity<Row>;
}): BatchController {
  const receipt = shallowRef<BatchResult | null>(null);
  const uncertain = shallowRef(false);
  const identity = options.identity ?? options.module.batch;
  if (new Set(options.commands.map((x) => x.key)).size !== options.commands.length)
    throw new Error("批量动作 key 重复");
  const selectedKeys = computed(() => cloneReadonlyModel<Id[]>(options.list.state.selectedKeys));
  const selected = computed(() =>
    options.list.state.rows.filter((row) =>
      selectedKeys.value.includes(options.config.getKey(cloneReadonlyModel<Row>(row)))
    )
  );
  const scopeLabel = computed(() =>
    options.list.state.selectedKeys.length
      ? `已勾选 ${options.list.state.selectedKeys.length} 条`
      : `未勾选：当前查询全部 ${options.list.state.total} 条（包含其他分页）`
  );
  const actions: CrudAction<Row, Id, C>[] = options.commands.map((command) => ({
    key: command.key,
    label: command.label,
    icon: command.icon,
    permission: command.permission,
    tone: command.tone,
    location: "toolbar",
    disabledReason: ({ selectedRows, selectedKeys }) => {
      if (!options.module.meta.componentKey) return "请配置 meta.componentKey";
      if (uncertain.value) return "上次提交结果未知，请先向后端核实，勿重复执行";
      if (options.list.state.error) return "请先成功加载列表";
      if (!selectedKeys.length)
        return !command.allowQuery
          ? "请先勾选记录"
          : options.list.state.total === 0
            ? "当前查询无记录"
            : undefined;
      if (identity?.field === "batchCode" && !identity.getValue)
        return "batchCode 需要配置 getValue";
      return command.disabledReason?.(selectedRows);
    },
    confirm: () => ({
      title: command.label,
      message: `即将${command.label}：${scopeLabel.value}。服务端执行时会再次检查权限与状态，是否继续？`,
    }),
    execute: async ({ selectedRows, selectedKeys, signal, context }) => {
      const componentKey = options.module.meta.componentKey;
      if (!componentKey) throw new Error("缺少后端模块组件码");
      const target: BatchRequest<Query>["target"] = selectedKeys.length
        ? {
            mode: "selected",
            field: identity?.field ?? "batchID",
            values: selectedRows.map((row) =>
              identity?.getValue
                ? identity.getValue(row)
                : options.config.getKey(cloneReadonlyModel<Row>(row))
            ),
          }
        : {
            mode: "query",
            query: options.config.toQuery(
              {
                scope: options.config.scope(context),
                where: combineQuery(
                  cloneReadonlyModel<AppliedQuery<S>>(options.list.state.applied)
                ),
                pageNum: 1,
                pageSize: 20,
                sort: null,
              },
              context
            ),
          };
      if (target.mode === "selected") {
        const keys = target.values.map(serializeStableKey);
        if (
          !keys.length ||
          keys.length !== selectedKeys.length ||
          new Set(keys).size !== keys.length
        )
          throw new Error("批量标识为空、过期或重复，请检查 batch.getValue");
      }
      const requestScope = options.config.scope(context).key;
      receipt.value = null;
      let result: BatchResult;
      const requestId = crypto.randomUUID();
      try {
        result = await options.request(
          { componentKey, action: command.key, requestId, target },
          signal
        );
      } catch (cause) {
        uncertain.value = true;
        throw new Error(
          `提交结果待核实（${requestId}），禁止自动重试：${cause instanceof Error ? cause.message : "请求失败"}`
        );
      }
      if (
        !result ||
        result.requestId !== requestId ||
        !Number.isSafeInteger(result.matched) ||
        result.matched < 0 ||
        !Number.isSafeInteger(result.succeeded) ||
        !Number.isSafeInteger(result.failed) ||
        result.succeeded < 0 ||
        result.failed < 0 ||
        result.succeeded + result.failed !== result.matched ||
        !Array.isArray(result.failures) ||
        result.failures.some(
          (item) =>
            !item ||
            (typeof item.key !== "string" && typeof item.key !== "number") ||
            typeof item.message !== "string"
        )
      ) {
        uncertain.value = true;
        throw new Error(`批量回执无效，提交结果待核实（${requestId}）`);
      }
      if (options.config.scope(options.context()).key === requestScope)
        receipt.value = { ...result, failures: result.failures.slice(0, 50) };
      invalidateView(options.module.meta.key);
      return { affectedKeys: [], message: `成功 ${result.succeeded} 条，失败 ${result.failed} 条` };
    },
  }));
  const executor = useCrudActions({
    actions,
    context: (signal) => ({
      signal,
      context: options.context(),
      selectedRows: selected.value,
      selectedKeys: selectedKeys.value,
    }),
    row: () => undefined,
    revision: () =>
      JSON.stringify([
        options.config.scope(options.context()).key,
        options.list.state.applied,
        options.list.state.selectedKeys,
        options.list.state.loading,
        options.list.state.total,
      ]),
    session: () => options.config.scope(options.context()).key,
    disabled: () => options.list.state.loading || !!options.list.state.busyActionKey,
    refresh: async () => {
      await options.list.refresh();
      if (options.list.state.error) throw new Error(options.list.state.error);
    },
  });
  watch(
    executor.busyKey,
    (value) => {
      if (options.lock) options.lock.value = !!value;
    },
    { flush: "sync" }
  );
  watch(
    () => options.config.scope(options.context()).key,
    () => {
      receipt.value = null;
    }
  );
  return {
    get buttons() {
      return actions.map((action) => ({
        key: action.key,
        label: action.label,
        icon: action.icon,
        tone: action.tone,
        ...executor.availability(action),
      }));
    },
    get scopeLabel() {
      return scopeLabel.value;
    },
    get busy() {
      return !!executor.busyKey.value;
    },
    get error() {
      return executor.error.value;
    },
    get result() {
      return receipt.value;
    },
    run: executor.run,
  };
}
