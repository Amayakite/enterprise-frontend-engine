import {
  computed,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
  readonly,
  ref,
  shallowRef,
  watch,
} from "vue";
import { cloneModel } from "@/components/business/fields/model";
import { createRequestChannel } from "@/utils/request-channel";
import {
  applyQueryDraft,
  combineQuery,
  createQueryDraft,
  emptyAppliedQuery,
} from "@/components/business/search/model";
import type {
  AppliedQuery,
  QueryPageRequest,
  QuerySchema,
  SearchQuerySource,
} from "@/components/business/search/types";

/**
 * 管理结构化查询、分页、排序与请求取消的独立生命周期。
 *
 * @typeParam Row 列表行类型。
 * @typeParam S 查询 schema。
 * @typeParam Scope 固定查询范围类型。
 * @typeParam Sort 排序结构，默认使用 QueryPageRequest 的排序类型。
 * @param source 查询配置和请求实现。
 * @param options 范围变化时的刷新覆盖；不配置时范围变化立即请求，配置后可先读取本机默认方案。
 * @returns 只读状态与 refresh/apply/reset/setPage/setSort 动作。
 * @remarks 不包含 CRUD 动作、行选择或表单；调用方显式首次调用 refresh。范围变化会取消旧请求、
 * 重置条件并自动刷新，迟到响应不会覆盖新范围数据。
 * @example
 * ```ts
 * const query = useSearchQuery(customerSearchSource);
 * await query.refresh();
 * await query.setPage(2, 20);
 * ```
 */
export function useSearchQuery<
  Row,
  S extends QuerySchema,
  Scope,
  Sort = QueryPageRequest<S, Scope>["sort"],
>(
  source: SearchQuerySource<Row, S, Scope, Sort>,
  options: {
    /** 范围重置后接管刷新；省略时立即刷新，用于先读取该范围默认方案。 */
    scopeChanged?: () => void;
  } = {}
) {
  /** 独立保存初始查询条件，供重置使用，不受调用方后续修改影响。 */
  const defaults = cloneModel(source.initial ?? emptyAppliedQuery<S>());
  /** 按查询字段规则校验初始条件；非法默认值在创建时直接报错。 */
  const initial = applyQueryDraft(source.schema, createQueryDraft(source.schema, defaults));
  if (!initial.valid)
    throw new Error(`默认查询无效：${initial.issues.map((item) => item.message).join("；")}`);
  /** 已经点击查询并生效的条件，与筛选面板中尚未应用的输入分开。 */
  const applied = shallowRef<AppliedQuery<S>>(initial.applied);
  /** 最近一次成功查询的当前页数据；开始新请求时清空。 */
  const rows = shallowRef<Row[]>([]);
  /** total 是总条数，pageNum 从 1 开始，pageSize 默认 20；三者共同决定分页。 */
  const total = ref(0),
    /** 当前查询页码，从 1 开始；应用新条件或排序时重置为 1。 */
    pageNum = ref(1),
    /** 每页条数，初始默认 20，setPage 只接受 1–100。 */
    pageSize = ref(source.pageSize ?? 20);
  /** 当前生效的排序；null 表示未指定排序。 */
  const sort = shallowRef<Sort | null>(source.initialSort ?? null);
  /** loading 表示查询进行中；error 保存当前查询失败或条件校验提示。 */
  const loading = ref(false),
    /** 当前查询或条件校验错误，开始新请求时清空。 */
    error = ref("");
  /** 调用方提供的固定组织等范围，用户筛选条件不能覆盖它。 */
  const scope = computed(() => source.scope());
  /** 仅允许最新一次查询回填；翻页或重新查询会取消上一请求。 */
  const channel = createRequestChannel();
  /** 实例卸载后阻止启动查询及异步回填。 */
  let alive = true;
  /** 当前缓存页是否在前台，范围变化时决定立即刷新还是延后。 */
  let active = true;
  /** 后台期间范围发生变化的标记，恢复显示后补一次查询。 */
  let pendingScope = false;
  /** 条件、分页、排序或范围变化的次数，供业务动作检查确认时的数据是否过期。 */
  let revision = 0;
  /** 按当前条件请求一页；页码超出末页时允许纠正一次，重复变化则提示刷新。 */
  async function load(allowClamp: boolean) {
    if (!alive) return;
    pendingScope = false;
    const run = channel.start();
    const scopeKey = scope.value.key;
    loading.value = true;
    error.value = "";
    rows.value = [];
    total.value = 0;
    // 复制本轮范围、条件和分页，避免等待接口时读到用户后来修改的参数。
    const query = cloneModel({
      scope: scope.value,
      where: combineQuery(applied.value),
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      sort: sort.value,
    });
    try {
      const result = await source.request(query, { signal: run.signal });
      if (!alive || !run.isCurrent() || scope.value.key !== scopeKey) return;
      if (!Array.isArray(result.list) || !Number.isSafeInteger(result.total) || result.total < 0)
        throw new Error("查询返回的列表或总数不正确");
      const last = Math.max(1, Math.ceil(result.total / query.pageSize));
      // 删除等操作可能使原页码不存在；最多重查一次末页，防止数据持续变化时递归请求。
      if (pageNum.value > last) {
        if (!allowClamp) throw new Error("数据范围再次变化，请刷新列表");
        pageNum.value = last;
        await load(false);
        return;
      }
      rows.value = result.list;
      total.value = result.total;
    } catch (cause) {
      if (alive && run.isCurrent() && scope.value.key === scopeKey)
        error.value = cause instanceof Error ? cause.message : "查询失败，请重试";
    } finally {
      if (alive && run.isCurrent()) loading.value = false;
    }
  }
  /** 重查当前条件与页码，并允许在数据减少后回到有效末页。 */
  const refresh = () => load(true);
  /** 校验并应用查询条件，可同时替换排序；回到第一页，条件无效时返回 false。 */
  async function apply(value: AppliedQuery<S>, nextSort?: Sort | null) {
    const parsed = applyQueryDraft(source.schema, createQueryDraft(source.schema, value));
    if (!parsed.valid) {
      error.value = parsed.issues.map((issue) => issue.message).join("；");
      return false;
    }
    applied.value = parsed.applied;
    if (nextSort !== undefined) sort.value = cloneModel(nextSort);
    pageNum.value = 1;
    revision++;
    await refresh();
    return true;
  }
  /** 恢复初始查询和排序，然后重新查询第一页。 */
  async function reset() {
    sort.value = cloneModel(source.initialSort ?? null);
    return apply(cloneModel(defaults));
  }
  /** 更新合法页码和每页条数；更改条数时回到第一页，相同分页不重复请求。 */
  async function setPage(page: number, limit = pageSize.value) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return;
    const next = limit === pageSize.value ? page : 1;
    if (next === pageNum.value && limit === pageSize.value) return;
    pageNum.value = next;
    pageSize.value = limit;
    revision++;
    await refresh();
  }
  /** 替换排序后回到第一页重新查询。 */
  async function setSort(value: Sort | null) {
    sort.value = cloneModel(value);
    pageNum.value = 1;
    revision++;
    await refresh();
  }
  /** 固定范围变化后取消旧查询、恢复默认条件；后台页等激活后再刷新。 */
  watch(
    () => [scope.value.key, JSON.stringify(scope.value.value)],
    () => {
      channel.cancel();
      // 新范围的默认方案可能异步读取或失效；不能继续展示旧范围数据或遗留 loading。
      rows.value = [];
      total.value = 0;
      loading.value = false;
      error.value = "";
      revision++;
      applied.value = cloneModel(initial.applied);
      pageNum.value = 1;
      sort.value = cloneModel(source.initialSort ?? null);
      if (!active) pendingScope = true;
      else refreshScope();
    }
  );
  /** 处理范围刷新；配置了 scopeChanged 时由调用方先加载该范围的默认查询方案。 */
  function refreshScope() {
    pendingScope = false;
    if (options.scopeChanged) options.scopeChanged();
    else void refresh();
  }
  /** 记录页面已隐藏，后续范围变化暂不请求。 */
  onDeactivated(() => {
    active = false;
  });
  /** 恢复页面时补做后台期间积累的范围刷新。 */
  onActivated(() => {
    active = true;
    if (pendingScope) refreshScope();
  });
  /** 销毁时取消查询并递增版本，令等待中的业务动作和响应失效。 */
  onBeforeUnmount(() => {
    alive = false;
    channel.cancel();
    revision++;
  });
  return {
    rows: readonly(rows),
    total: readonly(total),
    pageNum: readonly(pageNum),
    pageSize: readonly(pageSize),
    sort: readonly(sort),
    applied: readonly(applied),
    loading: readonly(loading),
    error: readonly(error),
    scope: readonly(scope),
    refresh,
    apply,
    reset,
    setPage,
    setSort,
    get revision() {
      return revision;
    },
  };
}
