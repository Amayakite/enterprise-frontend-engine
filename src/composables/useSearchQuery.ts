import { computed, onBeforeUnmount, readonly, ref, shallowRef, watch } from "vue";
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
 * @returns 只读状态与 refresh/apply/reset/setPage/setSort 动作。
 * @remarks 不包含 CRUD 动作、行选择或表单；宿主显式首次调用 refresh。范围变化会取消旧请求、
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
>(source: SearchQuerySource<Row, S, Scope, Sort>) {
  const defaults = cloneModel(source.initial ?? emptyAppliedQuery<S>());
  const initial = applyQueryDraft(source.schema, createQueryDraft(source.schema, defaults));
  if (!initial.valid)
    throw new Error(`默认查询无效：${initial.issues.map((item) => item.message).join("；")}`);
  const applied = shallowRef<AppliedQuery<S>>(initial.applied);
  const rows = shallowRef<Row[]>([]);
  const total = ref(0),
    pageNum = ref(1),
    pageSize = ref(source.pageSize ?? 20);
  const sort = shallowRef<Sort | null>(source.initialSort ?? null);
  const loading = ref(false),
    error = ref("");
  const scope = computed(() => source.scope());
  const channel = createRequestChannel();
  let alive = true;
  let revision = 0;
  async function load(allowClamp: boolean) {
    if (!alive) return;
    const run = channel.start();
    const scopeKey = scope.value.key;
    loading.value = true;
    error.value = "";
    rows.value = [];
    total.value = 0;
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
  const refresh = () => load(true);
  async function apply(value: AppliedQuery<S>) {
    const parsed = applyQueryDraft(source.schema, createQueryDraft(source.schema, value));
    if (!parsed.valid) {
      error.value = parsed.issues.map((issue) => issue.message).join("；");
      return false;
    }
    applied.value = parsed.applied;
    pageNum.value = 1;
    revision++;
    await refresh();
    return true;
  }
  async function reset() {
    sort.value = cloneModel(source.initialSort ?? null);
    return apply(cloneModel(defaults));
  }
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
  async function setSort(value: Sort | null) {
    sort.value = cloneModel(value);
    pageNum.value = 1;
    revision++;
    await refresh();
  }
  watch(
    () => [scope.value.key, JSON.stringify(scope.value.value)],
    () => {
      channel.cancel();
      revision++;
      applied.value = cloneModel(initial.applied);
      pageNum.value = 1;
      sort.value = cloneModel(source.initialSort ?? null);
      void refresh();
    }
  );
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
