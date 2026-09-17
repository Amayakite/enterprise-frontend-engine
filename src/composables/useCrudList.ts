import {
  computed,
  onActivated,
  onMounted,
  readonly,
  shallowRef,
  watch,
  type DeepReadonly,
} from "vue";
import { useSearchQuery } from "./useSearchQuery";
import { useCrudActions } from "./useCrudActions";
import { cloneModel, readonlyModel } from "@/components/business/fields/model";
import { serializeStableKey } from "@/utils/identity";
import { applyQueryDraft, createQueryDraft } from "@/components/business/search/model";
import { viewInvalidationRevision } from "./useViewInvalidation";
import type { QuerySchema } from "@/components/business/search/types";
import type { TableSort } from "@/components/table/types";
import type { CrudListConfig, CrudListController } from "@/components/business/crud/types";

/**
 * 将模块 CrudListConfig 装配为可供 MyCrudList 使用的受控列表控制器。
 *
 * @typeParam Row 列表行类型。
 * @typeParam Id 行稳定主键。
 * @param config 模块 list 配置。
 * @param context 返回当前页面上下文的 getter；调用时会拍摄只读快照。
 * @param options 可选的 KeepAlive 页面失效 key。
 * @remarks 复用结构化查询核心，只增加查询草稿、当前页选择和业务动作；不会缓存历史页数据。
 * @example `const controller = useCrudList(config.list, () => pageContext, { invalidationKey: "base.customer.list" });`
 */
export function useCrudList<
  Row,
  Id extends string | number,
  S extends QuerySchema,
  Scope,
  QueryDTO,
  C,
>(
  config: CrudListConfig<Row, Id, S, Scope, QueryDTO, C>,
  context: () => DeepReadonly<C>,
  options: { invalidationKey?: string; disabled?: () => boolean } = {}
) {
  const query = useSearchQuery<Row, S, Scope, TableSort<Row>>({
    schema: config.query.schema,
    initial: config.query.initial,
    initialSort: config.initialSort,
    pageSize: config.pageSize,
    scope: () => config.scope(context()),
    request: async (request, run) => {
      const snapshot = cloneModel(context());
      const dto = config.toQuery(request, snapshot);
      const input = { ...run, context: snapshot };
      const guard = config.beforeQuery
        ? await config.beforeQuery(readonlyModel(dto), input)
        : undefined;
      run.signal.throwIfAborted();
      if (guard && !guard.proceed) throw new Error(guard.reason);
      const result = await config.request(dto, input);
      run.signal.throwIfAborted();
      if (Array.isArray(result.list)) {
        const keys = result.list.map((row) => serializeStableKey(config.getKey(row)));
        if (new Set(keys).size !== keys.length) throw new Error("列表返回了重复的行键");
      }
      if (config.afterQuery) await config.afterQuery(readonlyModel(result), input);
      run.signal.throwIfAborted();
      return result;
    },
  });
  const draft = shallowRef(createQueryDraft(config.query.schema, config.query.initial));
  const selectedKeys = shallowRef<Id[]>([]);
  const queryError = shallowRef<string | null>(null);
  let selectionRevision = 0;
  const clearSelection = () => {
    selectedKeys.value = [];
    selectionRevision++;
  };
  watch(
    query.loading,
    (value) => {
      if (value) clearSelection();
    },
    { flush: "sync" }
  );
  watch(
    () => query.scope.value.key,
    () => {
      draft.value = createQueryDraft(config.query.schema, config.query.initial);
    },
    { flush: "sync" }
  );
  const snapshot = <T>(value: T) => readonly(shallowRef(cloneModel(value))).value;
  // 每次数据变化只构建一次行索引。按钮可用性会在每个单元格多次求值，不能为取 ID
  // 反复深拷贝主子表数据并扫描整页；独立只读快照仍隔离业务回调对查询数据的修改。
  const indexedRows = computed(() => {
    const index = new Map<Id, DeepReadonly<Row>>();
    for (const value of query.rows.value) {
      const row = cloneModel(value) as Row;
      index.set(config.getKey(row), snapshot(row));
    }
    return index;
  });
  const contextSnapshot = computed(() => snapshot(context()));
  const selectedRows = computed(() => {
    const keys = new Set(selectedKeys.value);
    return Object.freeze(
      [...indexedRows.value].filter(([key]) => keys.has(key)).map(([, row]) => row)
    );
  });
  const actionContext = (signal: AbortSignal) =>
    Object.freeze({
      signal,
      context: contextSnapshot.value,
      selectedKeys: Object.freeze([...selectedKeys.value]),
      selectedRows: selectedRows.value,
    });
  const actions = useCrudActions({
    actions: config.actions ?? [],
    context: actionContext,
    row: (key, signal) => {
      const row = indexedRows.value.get(key);
      return row ? Object.freeze({ ...actionContext(signal), row, rowKey: key }) : undefined;
    },
    revision: () => `${query.revision}:${selectionRevision}:${query.scope.value.key}`,
    session: () => query.scope.value.key,
    disabled: () => query.loading.value || !!options.disabled?.(),
    refresh: async (strategy) => {
      if (strategy === "first-page" && query.pageNum.value !== 1) await query.setPage(1);
      else await query.refresh();
      if (query.error.value) throw new Error(query.error.value);
    },
  });
  watch(
    query.loading,
    (value) => {
      if (value) actions.clearError();
    },
    { flush: "sync" }
  );
  // 各 getter 直接依赖所属 ref；不能用一个 computed 对象令草稿更新也使 applied 投影失效。
  const state = {
    get rows() {
      return query.rows.value;
    },
    get total() {
      return query.total.value;
    },
    get loading() {
      return query.loading.value;
    },
    get busyActionKey() {
      return actions.busyKey.value;
    },
    get error() {
      return actions.error.value || queryError.value || query.error.value || null;
    },
    get pageNum() {
      return query.pageNum.value;
    },
    get pageSize() {
      return query.pageSize.value;
    },
    get sort() {
      return query.sort.value;
    },
    get selectedKeys() {
      return selectedKeys.value;
    },
    get applied() {
      return query.applied.value;
    },
    get draft() {
      return draft.value;
    },
  };
  let mounted = false;
  let handledInvalidation = viewInvalidationRevision(options.invalidationKey);
  let invalidationRefreshRun = 0;
  onMounted(() => {
    mounted = true;
    void query.refresh();
  });
  onActivated(() => {
    if (!mounted) return;
    const revision = viewInvalidationRevision(options.invalidationKey);
    if (revision === handledInvalidation) return;
    const run = ++invalidationRefreshRun;
    const queryRevision = query.revision;
    void (async () => {
      await query.refresh();
      // 失败时保留失效标记，下一次恢复继续重试。请求期间若又发生写入，
      // 这里只确认本次开始时看到的版本，不能吞掉更新的失效版本。
      // 若被另一轮查询取消，也不能用旧请求的完成状态误确认版本。
      if (
        run === invalidationRefreshRun &&
        !query.loading.value &&
        !query.error.value &&
        query.revision === queryRevision
      )
        handledInvalidation = revision;
    })();
  });
  const controller: CrudListController<Row, Id, S> = {
    // Vue 的 DeepReadonly 对未实例化泛型不满足幂等推导；运行时仍深只读。
    get state() {
      return readonly(state) as CrudListController<Row, Id, S>["state"];
    },
    setDraft(value) {
      draft.value = cloneModel(value);
      queryError.value = null;
    },
    cancelQuery() {
      draft.value = createQueryDraft(
        config.query.schema,
        cloneModel(query.applied.value) as typeof config.query.initial
      );
      queryError.value = null;
    },
    async applyQuery() {
      const result = applyQueryDraft(config.query.schema, draft.value);
      if (!result.valid) {
        queryError.value = result.issues.map((issue) => issue.message).join("；");
        return false;
      }
      queryError.value = null;
      return query.apply(result.applied);
    },
    async resetQuery() {
      draft.value = createQueryDraft(config.query.schema, config.query.initial);
      queryError.value = null;
      await query.reset();
    },
    refresh: query.refresh,
    setPage: query.setPage,
    setSort: query.setSort,
    select(keys) {
      if (
        query.loading.value ||
        actions.busyKey.value ||
        options.disabled?.() ||
        !config.selection ||
        config.selection === "none"
      )
        return;
      const present = indexedRows.value;
      const next = [...new Set(keys)].filter((key) => present.has(key));
      selectedKeys.value = config.selection === "single" ? next.slice(-1) : next;
      selectionRevision++;
    },
    runAction: actions.run,
    actionAvailability(key, rowKey) {
      const action = config.actions?.find((item) => item.key === key);
      return action ? actions.availability(action, rowKey) : { visible: false };
    },
    get actionResult() {
      return actions.result.value;
    },
  };
  return controller;
}
