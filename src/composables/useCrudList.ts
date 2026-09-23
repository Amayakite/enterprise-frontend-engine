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
import { useQueryPresets } from "./useQueryPresets";
import type { CrudColumnIdentity } from "./useCrudColumns";
import { useCrudActions } from "./useCrudActions";
import { cloneModel, cloneReadonlyModel, readonlyModel } from "@/components/business/fields/model";
import { serializeStableKey } from "@/utils/identity";
import { applyQueryDraft, createQueryDraft } from "@/components/business/search/model";
import { viewInvalidationRevision } from "./useViewInvalidation";
import type { QuerySchema } from "@/components/business/search/types";
import type { TableSort } from "@/components/table/types";
import type { CrudListConfig, CrudListController } from "@/components/business/crud/types";

/**
 * 根据模块 list 配置管理列表查询、筛选、勾选和按钮操作，返回值可直接传给 MyCrudList。
 *
 * @typeParam Row 列表行类型。
 * @typeParam Id 行稳定主键。
 * @param config 模块 list 配置。
 * @param context 返回当前页面上下文的 getter；调用时会拍摄只读快照。
 * @param options 可选的 KeepAlive 页面失效 key。
 * @remarks 复用结构化查询核心，只增加查询草稿、当前页选择和业务动作；不会缓存历史页数据。
 * @example
 * `const controller = useCrudList(config.list, () => pageContext, { invalidationKey: "base.customer.list" });`
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
  options: {
    /** KeepAlive 失效通知的稳定模块 key；省略时不订阅通知。 */
    invalidationKey?: string;
    /** 返回批量动作等外部忙碌状态；省略时不额外禁用。 */
    disabled?: () => boolean;
    /** 命名方案存储身份；启用 queryPresets 时必须提供，复用公共用户/范围隔离。 */
    preference?: () => CrudColumnIdentity;
  } = {}
) {
  /** 复用结构化查询管理条件和分页，在请求前后追加模块回调及行键检查。 */
  const query = useSearchQuery<Row, S, Scope, TableSort<Row>>(
    {
      schema: config.query.schema,
      initial: config.query.initial,
      initialSort: config.initialSort,
      pageSize: config.pageSize,
      scope: () => config.scope(context()),
      request: async (request, run) => {
        // 固定本次查询的组织和权限数据，前后回调与 DTO 转换使用同一份快照。
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
    },
    {
      scopeChanged: () => {
        void initializeQuery();
      },
    }
  );
  /** 筛选面板中尚未应用的条件；取消筛选时从已应用条件恢复。 */
  const draft = shallowRef(createQueryDraft(config.query.schema, config.query.initial));
  /** 可选的本机查询方案；同时配置方案规则和存储身份时才启用。 */
  const presets =
    config.queryPresets && options.preference
      ? useQueryPresets<Row, S>({
          config: config.queryPresets,
          schema: config.query.schema,
          sortKeys: config.columns.filter((column) => column.sortable).map((column) => column.key),
          identity: options.preference,
          snapshot: () => ({
            query: cloneReadonlyModel<typeof config.query.initial>(query.applied.value),
            sort: cloneReadonlyModel<TableSort<Row> | null>(query.sort.value),
          }),
          apply: async (snapshot) => {
            draft.value = createQueryDraft(config.query.schema, snapshot.query);
            return query.apply(snapshot.query, snapshot.sort);
          },
        })
      : undefined;
  /** 范围初始化次数，防止旧默认方案读取结束后补发无条件查询。 */
  let initializeRun = 0;
  /** 先尝试当前范围的默认方案；未配置默认方案时才按默认条件请求列表。 */
  async function initializeQuery() {
    const run = ++initializeRun;
    if (presets && (await presets.initialize())) return;
    if (run === initializeRun) await query.refresh();
  }
  /** 仅保存当前页已勾选的稳定 ID，刷新或换范围时清空。 */
  const selectedKeys = shallowRef<Id[]>([]);
  /** 筛选草稿校验错误，与请求失败和按钮操作错误分开保存。 */
  const queryError = shallowRef<string | null>(null);
  /** 勾选变化次数，确认框等待期间改了选择则原动作不再执行。 */
  let selectionRevision = 0;
  /** 清空当前勾选并让基于旧选择的业务动作失效。 */
  const clearSelection = () => {
    selectedKeys.value = [];
    selectionRevision++;
  };
  /** 每次开始查询清空勾选，避免操作刷新前的旧记录。 */
  watch(
    query.loading,
    (value) => {
      if (value) clearSelection();
    },
    { flush: "sync" }
  );
  /** 范围 key 变化后重置筛选草稿、选择及旧校验提示。 */
  watch(
    () => query.scope.value.key,
    () => {
      draft.value = createQueryDraft(config.query.schema, config.query.initial);
      clearSelection();
      queryError.value = null;
    },
    { flush: "sync" }
  );
  /** 为业务动作提供只读数据，禁止回调直接修改列表或上下文。 */
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
  /** 当前组织和权限等数据的只读视图，供行按钮及批量动作使用。 */
  const contextSnapshot = computed(() => snapshot(context()));
  /** 按勾选 ID 从当前页索引提取只读记录，忽略已不在本页的 ID。 */
  const selectedRows = computed(() => {
    const keys = new Set(selectedKeys.value);
    return Object.freeze(
      [...indexedRows.value].filter(([key]) => keys.has(key)).map(([, row]) => row)
    );
  });
  /** 为一次按钮操作组装取消信号、上下文和勾选快照。 */
  const actionContext = (signal: AbortSignal) =>
    Object.freeze({
      signal,
      context: contextSnapshot.value,
      selectedKeys: Object.freeze([...selectedKeys.value]),
      selectedRows: selectedRows.value,
    });
  /** 管理列表按钮的权限、确认和执行，成功后按动作配置刷新分页。 */
  const actions = useCrudActions({
    actions: config.actions ?? [],
    context: actionContext,
    row: (key, signal) => {
      const row = indexedRows.value.get(key);
      return row ? Object.freeze({ ...actionContext(signal), row, rowKey: key }) : undefined;
    },
    revision: () => `${query.revision}:${selectionRevision}:${query.scope.value.key}`,
    session: () => query.scope.value.key,
    disabled: () => query.loading.value || !!presets?.controller.busy || !!options.disabled?.(),
    refresh: async (strategy) => {
      if (strategy === "first-page" && query.pageNum.value !== 1) await query.setPage(1);
      else await query.refresh();
      if (query.error.value) throw new Error(query.error.value);
    },
  });
  /** 新查询开始时清除上次按钮错误，避免提示与新数据混在一起。 */
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
      return query.loading.value || !!presets?.controller.busy;
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
  /** 标记首次挂载已开始，避免首次 activated 重复处理刷新。 */
  let mounted = false;
  /** 最近成功刷新时确认的模块变化版本，失败时不前移。 */
  let handledInvalidation = viewInvalidationRevision(options.invalidationKey);
  /** 缓存页刷新轮次，防止旧刷新完成后吞掉新的失效通知。 */
  let invalidationRefreshRun = 0;
  /** 首次挂载先读取默认查询方案，再发起对应查询。 */
  onMounted(() => {
    mounted = true;
    void initializeQuery();
  });
  /** 缓存页恢复时检查其他页面的写入通知；仅数据已过期才刷新。 */
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
  /** 向列表组件暴露筛选、分页、勾选和按钮动作，状态只读。 */
  const controller: CrudListController<Row, Id, S> = {
    presets: presets?.controller,
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
      presets?.clearActive();
      return query.apply(result.applied);
    },
    async resetQuery() {
      draft.value = createQueryDraft(config.query.schema, config.query.initial);
      queryError.value = null;
      presets?.clearActive();
      await query.reset();
    },
    refresh: query.refresh,
    setPage: query.setPage,
    setSort: (value) => {
      presets?.clearActive();
      return query.setSort(value);
    },
    select(keys) {
      if (
        query.loading.value ||
        presets?.controller.busy ||
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
