import { isEmptyValue } from "@/utils/validate";
import { computed, ref, shallowRef, watch, onBeforeUnmount, nextTick, toRaw } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { normalizeSearchText } from "@/utils/string";
import {
  applyQueryDraft,
  combineQuery,
  createQueryDraft,
  emptyAppliedQuery,
} from "@/components/business/search/model";
import type { AppliedQuery, QuerySchema } from "@/components/business/search/types";
import {
  checkReferencePage,
  checkReferenceResolve,
  checkReferenceConditions,
  referenceFilterKey,
} from "./contract";
import { createReferenceChannel } from "./request-channel";
import { referenceIds, sameReferenceSelection, changeReferenceSelection } from "./selection";
import type {
  ReferenceInputProps,
  ReferenceValue,
  ReferenceId,
  ReferenceFilters,
  ReferenceCommit,
  ReferenceError,
  ReferenceResolveState,
  QueryValue,
  ReferenceCondition,
} from "./types";

/** 参照选择/解析/弹窗控制器；管理过期请求取消与选择守卫，不持久化字典缓存。 */
export function useReference<
  Row extends object,
  Id extends ReferenceId,
  F extends ReferenceFilters,
  Multiple extends boolean = false,
>(
  props: ReferenceInputProps<Row, Id, F, Multiple>,
  events: {
    /**
     * 更新当前字段的公开回调；传该字段的值，不直接赋值到只读 model。
     */
    update: (value: ReferenceValue<Id, Multiple>) => void;

    /**
     * 提交当前行临时编辑或已通过守卫的参照值；不自动保存到后端。
     */
    commit: (value: ReferenceCommit<Row, Id, Multiple>) => void;

    /**
     * 接收 ID 回显状态；含已解析/失效/待解析集合，不是用户主动选中事件。
     */
    resolve: (value: ReferenceResolveState<Row, Id>) => void;

    /**
     * 本次失败信息；无错误时为空值。unknown 类型需先判断再读取 message。
     */
    error: (value: ReferenceError) => void;

    /**
     * 接收参照弹窗开关状态；true 已打开，false 已关闭，不代表选值提交。
     */
    open: (value: boolean) => void;
  }
) {
  const initialMultiple = !!props.multiple;
  const model = computed(() => {
    try {
      if (!!props.multiple !== initialMultiple) throw new Error("切换单多选模式需要重新创建组件");
      if (Array.isArray(props.modelValue) !== initialMultiple)
        throw new Error("参照模型与单多选模式不匹配");
      return { ids: referenceIds<Id>(props.modelValue), error: "" };
    } catch (error) {
      return { ids: [] as Id[], error: error instanceof Error ? error.message : "参照模型无效" };
    }
  });
  const committedIds = computed(() => model.value.ids);
  const modelError = computed(() => model.value.error);
  const resolvedRecords = shallowRef(new Map<Id, Row>());
  // Map 整体由一个上下文持有；范围改变立即清空，不可能复用另一组织的条目。
  const cache = new Map<Id, Row>();
  const resolving = ref(false),
    resolveError = ref("");
  const validationUnavailableIds = shallowRef<Id[]>([]);
  const unavailableIds = shallowRef<Id[]>([]),
    pendingIds = shallowRef<Id[]>([]);
  const unavailable = computed(() => unavailableIds.value.length > 0);
  const selectedItems = computed(() =>
    committedIds.value.flatMap((id) => {
      const item = resolvedRecords.value.get(id);
      return item ? [item] : [];
    })
  );
  const selected = computed(() => selectedItems.value[0]);
  const typing = ref(false),
    keyword = ref(""),
    composing = ref(false);
  const suggestions = shallowRef<Row[]>([]),
    suggesting = ref(false),
    suggestError = ref(""),
    activeIndex = ref(-1);
  const visible = ref(false),
    dialogKeyword = ref("");
  const conditionValues = ref<Record<string, QueryValue>>({});
  const queryApplied = shallowRef<AppliedQuery<QuerySchema>>(emptyAppliedQuery());
  const conditions = computed<ReferenceCondition[]>(() =>
    (props.source.searchFields ?? []).flatMap((field) => {
      const value = conditionValues.value[field.key];
      return isEmptyValue(value) ? [] : [{ key: field.key, operator: field.operator, value }];
    })
  );
  const rows = shallowRef<Row[]>([]),
    total = ref(0),
    page = ref(1),
    limit = ref(10);
  const searching = ref(false),
    searchError = ref("");
  const draftIds = shallowRef<Id[]>([]),
    draftRecords = shallowRef(new Map<Id, Row>());
  const draft = computed(() =>
    draftIds.value.length ? draftRecords.value.get(draftIds.value[0]) : undefined
  );
  const guarding = ref(false),
    guardError = ref("");
  const channels = {
    suggest: createReferenceChannel(),
    search: createReferenceChannel(),
    resolve: createReferenceChannel(),
  };
  // 守卫中的最终有效性请求独立取消，不能挤掉已提交值的展示回显。
  const guardChannel = createReferenceChannel();
  let session = 0,
    alive = true;
  const locked = computed(() => !!props.disabled || !!props.readonly || !!modelError.value);
  const maximum = computed(() => (props.multiple ? (props.maxSelected ?? Infinity) : 1));
  const label = computed(() => {
    if (!committedIds.value.length) return "";
    if (props.multiple) return `已选 ${committedIds.value.length} 项`;
    if (resolveError.value) return "回显失败";
    if (unavailable.value) return "记录不可用";
    return selected.value ? props.source.getLabel(selected.value) : "加载中";
  });
  const eligible = (row: Readonly<Row>) => props.source.selectable?.(row) ?? { allowed: true };
  function isSelected(row: Readonly<Row>, inDraft = false) {
    return (inDraft ? draftIds.value : committedIds.value).includes(props.source.getKey(row));
  }
  function choiceAvailability(row: Readonly<Row>, inDraft = false) {
    if (props.multiple && isSelected(row, inDraft)) return { allowed: true };
    const allowed = eligible(row);
    if (!allowed.allowed) return allowed;
    return (inDraft ? draftIds.value : committedIds.value).length >= maximum.value && props.multiple
      ? { allowed: false, reason: `最多选择 ${maximum.value} 项` }
      : allowed;
  }
  const pageIds = computed(() =>
    rows.value.filter((row) => eligible(row).allowed).map(props.source.getKey)
  );
  const pageAll = computed(
    () => pageIds.value.length > 0 && pageIds.value.every((id) => draftIds.value.includes(id))
  );
  const pageSome = computed(
    () => !pageAll.value && pageIds.value.some((id) => draftIds.value.includes(id))
  );
  const contextKey = () =>
    JSON.stringify([props.source.key, props.scopeKey, referenceFilterKey(props.filters)]);
  const modelStamp = (value: ReferenceValue<Id, Multiple> = props.modelValue) =>
    JSON.stringify(value);
  let ownEcho:
    | {
        /**
         * 内部本次解析指纹；用于区分过期任务，不作为业务缓存 key。
         */
        stamp: string;
        /**
         * 内部请求范围指纹；仅用于丢弃跨范围的旧响应。
         */
        context: string;
        /**
         * 参照数据源合同；提供稳定 key、行主键/名称、搜索和 ID 回显方法。创建对象本身不发请求。
         * @example
         * `source: provinceReference`
         */
        source: typeof props.source;
      }
    | undefined;
  function capture(includeSession = true) {
    const source = props.source,
      context = contextKey(),
      model = modelStamp(),
      currentSession = session,
      max = maximum.value;
    return () =>
      alive &&
      source === props.source &&
      context === contextKey() &&
      model === modelStamp() &&
      max === maximum.value &&
      (!includeSession || currentSession === session);
  }
  function snapshotFilters(): F {
    return JSON.parse(referenceFilterKey(props.filters)) as F;
  }
  function cloneRecord(row: Readonly<Row>): Row {
    return structuredClone(toRaw(row)) as Row;
  }
  function cacheRecords(items: readonly Row[]) {
    for (const row of items) cache.set(props.source.getKey(row), cloneRecord(row));
  }
  function toValue(ids: readonly Id[]): ReferenceValue<Id, Multiple> {
    // 判别模式在运行期固定；边界转换保留 source 的 Id 类型关联。
    return (props.multiple ? [...ids] : (ids[0] ?? null)) as ReferenceValue<Id, Multiple>;
  }
  function report(phase: ReferenceError["phase"], error: unknown) {
    events.error({ phase, error });
    return error instanceof Error ? error.message : "请求失败，请重试";
  }
  function cancelGuard() {
    guardChannel.cancel();
    guarding.value = false;
  }
  function stopTyping() {
    session++;
    typing.value = false;
    composing.value = false;
    channels.suggest.cancel();
    suggesting.value = false;
    suggestions.value = [];
    activeIndex.value = -1;
    cancelGuard();
  }
  function close() {
    stopTyping();
    channels.search.cancel();
    searching.value = false;
    draftIds.value = [];
    draftRecords.value = new Map();
    validationUnavailableIds.value = [];
    if (visible.value) {
      visible.value = false;
      events.open(false);
    }
  }
  async function requestRecords(ids: readonly Id[], signal: AbortSignal) {
    if (!ids.length) return { items: [] as Row[], unavailableIds: [] as Id[] };
    const result = checkReferenceResolve(
      await props.source.resolve(ids, snapshotFilters(), { signal }),
      ids,
      props.source.getKey
    );
    const items: Row[] = [],
      unavailable = [...result.unavailableIds];
    for (const row of result.items) {
      if (eligible(row).allowed) items.push(cloneRecord(row));
      else unavailable.push(props.source.getKey(row));
    }
    return { items, unavailableIds: unavailable };
  }
  function emitResolved() {
    events.resolve({
      items: selectedItems.value
        .filter((row) => !pendingIds.value.includes(props.source.getKey(row)))
        .map(cloneRecord),
      unavailableIds: [...unavailableIds.value],
      pendingIds: [...pendingIds.value],
    });
  }
  async function resolveSelection(force = true) {
    const ticket = channels.resolve.start(),
      valid = capture(false),
      ids = [...committedIds.value];
    if (modelError.value) return { allowed: false, reason: modelError.value };
    const needed = force ? ids : ids.filter((id) => !cache.has(id));
    resolvedRecords.value = new Map(
      ids.flatMap((id) => {
        const row = cache.get(id);
        return row ? [[id, cloneRecord(row)] as const] : [];
      })
    );
    resolveError.value = "";
    unavailableIds.value = [];
    pendingIds.value = needed;
    resolving.value = needed.length > 0;
    emitResolved();
    try {
      const result = await requestRecords(needed, ticket.signal);
      if (!ticket.isCurrent() || !valid())
        return { allowed: false, reason: "选择已改变，请重新校验" };
      for (const id of needed) cache.delete(id);
      cacheRecords(result.items);
      resolvedRecords.value = new Map(
        ids.flatMap((id) => {
          const row = cache.get(id);
          return row ? [[id, cloneRecord(row)] as const] : [];
        })
      );
      if (visible.value) {
        const records = new Map(draftRecords.value);
        for (const id of draftIds.value) {
          const row = resolvedRecords.value.get(id);
          if (!records.has(id) && row) records.set(id, cloneRecord(row));
        }
        draftRecords.value = records;
      }
      unavailableIds.value = result.unavailableIds;
      pendingIds.value = [];
      emitResolved();
      return {
        allowed: result.unavailableIds.length === 0 && ids.length <= maximum.value,
        reason: result.unavailableIds.length
          ? "记录不可用"
          : ids.length > maximum.value
            ? `最多选择 ${maximum.value} 项`
            : undefined,
      };
    } catch (error) {
      if (ticket.isCurrent() && valid()) {
        for (const id of needed) cache.delete(id);
        resolveError.value = report("resolve", error);
        emitResolved();
      }
      return { allowed: false, reason: "回显失败或选择已改变，请重试" };
    } finally {
      if (ticket.isCurrent() && valid()) resolving.value = false;
    }
  }
  async function suggest() {
    const text = normalizeSearchText(keyword.value);
    if (!typing.value || composing.value || locked.value || text.length < (props.minChars ?? 1))
      return;
    const ticket = channels.suggest.start(),
      valid = capture();
    suggesting.value = true;
    suggestError.value = "";
    try {
      const size = Math.max(1, Math.min(100, props.suggestLimit ?? 8));
      const result = checkReferencePage(
        await props.source.search(
          {
            keyword: text,
            filters: snapshotFilters(),
            conditions: [],
            pageNum: 1,
            pageSize: size,
            purpose: "suggest",
          },
          { signal: ticket.signal }
        ),
        props.source.getKey,
        size
      );
      if (ticket.isCurrent() && valid()) suggestions.value = result.list;
    } catch (error) {
      if (ticket.isCurrent() && valid()) suggestError.value = report("suggest", error);
    } finally {
      if (ticket.isCurrent() && valid()) suggesting.value = false;
    }
  }
  const delayedSuggest = useDebounceFn(
    (valid: () => boolean) => {
      if (valid()) void suggest();
    },
    () => props.debounceMs ?? 250
  );
  function input(text: string) {
    stopTyping();
    typing.value = true;
    keyword.value = text;
    suggestError.value = "";
    guardError.value = "";
    suggesting.value = normalizeSearchText(text).length >= (props.minChars ?? 1);
    void delayedSuggest(capture());
  }
  function compositionStart() {
    const text = typing.value ? keyword.value : label.value;
    stopTyping();
    keyword.value = text;
    typing.value = true;
    composing.value = true;
  }
  async function search() {
    if (!visible.value) return;
    const ticket = channels.search.start(),
      valid = capture();
    searching.value = true;
    searchError.value = "";
    rows.value = [];
    try {
      const result = checkReferencePage(
        await (props.source.query
          ? props.source.query.request(
              {
                scope: { key: props.scopeKey, value: snapshotFilters() },
                where: combineQuery(queryApplied.value),
                pageNum: page.value,
                pageSize: limit.value,
                sort: null,
              },
              { signal: ticket.signal }
            )
          : props.source.search(
              {
                keyword: normalizeSearchText(dialogKeyword.value),
                filters: snapshotFilters(),
                conditions: checkReferenceConditions(
                  props.source.searchFields ?? [],
                  conditions.value
                ),
                pageNum: page.value,
                pageSize: limit.value,
                purpose: "dialog",
              },
              { signal: ticket.signal }
            )),
        props.source.getKey,
        limit.value
      );
      if (ticket.isCurrent() && valid()) {
        rows.value = result.list;
        total.value = result.total;
      }
    } catch (error) {
      if (ticket.isCurrent() && valid()) searchError.value = report("search", error);
    } finally {
      if (ticket.isCurrent() && valid()) searching.value = false;
    }
  }
  async function open() {
    if (locked.value || guarding.value || visible.value) return false;
    stopTyping();
    const valid = capture(),
      ticket = guardChannel.start();
    guarding.value = true;
    guardError.value = "";
    try {
      const result = (await props.beforeOpen?.()) ?? { allowed: true };
      if (!ticket.isCurrent() || !valid() || locked.value) return false;
      if (!result.allowed) {
        guardError.value = result.reason ?? "暂时不能选择";
        return false;
      }
      draftIds.value = [...committedIds.value];
      draftRecords.value = new Map(
        [...resolvedRecords.value].map(([id, row]) => [id, cloneRecord(row)])
      );
      dialogKeyword.value = "";
      conditionValues.value = {};
      queryApplied.value = emptyAppliedQuery();
      page.value = 1;
      visible.value = true;
      events.open(true);
      void search();
      return true;
    } catch (error) {
      if (ticket.isCurrent() && valid()) guardError.value = report("guard", error);
      return false;
    } finally {
      if (ticket.isCurrent()) guarding.value = false;
    }
  }
  async function commitIds(
    ids: readonly Id[],
    reason: ReferenceCommit<Row, Id, Multiple>["reason"] = "select",
    keepSuggestions = false
  ) {
    if (locked.value || guarding.value) return false;
    const next = referenceIds(ids);
    if (next.length > maximum.value && next.some((id) => !committedIds.value.includes(id))) {
      guardError.value = `最多选择 ${maximum.value} 项`;
      return false;
    }
    const ticket = guardChannel.start(),
      valid = capture();
    guarding.value = true;
    guardError.value = "";
    try {
      const result = await requestRecords(next, ticket.signal);
      if (!ticket.isCurrent() || !valid() || locked.value) return false;
      validationUnavailableIds.value = result.unavailableIds;
      if (result.unavailableIds.length) {
        const records = new Map(resolvedRecords.value);
        for (const id of result.unavailableIds) {
          cache.delete(id);
          records.delete(id);
        }
        resolvedRecords.value = records;
        unavailableIds.value = referenceIds([
          ...unavailableIds.value,
          ...result.unavailableIds.filter((id) => committedIds.value.includes(id)),
        ]);
        emitResolved();
        guardError.value = `有 ${result.unavailableIds.length} 项记录不可用，请移除后重试`;
        return false;
      }
      const records = new Map(result.items.map((row) => [props.source.getKey(row), row]));
      const items = next.map((id) => records.get(id)!);
      cacheRecords(items);
      if (sameReferenceSelection(next, committedIds.value)) {
        void resolveSelection(false);
        if (!keepSuggestions) close();
        return true;
      }
      const payload: ReferenceCommit<Row, Id, Multiple> = {
        value: toValue(next),
        previousValue: toValue(committedIds.value),
        items: items.map(cloneRecord),
        addedIds: next.filter((id) => !committedIds.value.includes(id)),
        removedIds: committedIds.value.filter((id) => !next.includes(id)),
        reason,
      };
      const allowed = (await props.beforeCommit?.(structuredClone(payload))) ?? { allowed: true };
      if (!ticket.isCurrent() || !valid() || locked.value) return false;
      if (!allowed.allowed) {
        guardError.value = allowed.reason ?? "本次选择未通过校验";
        return false;
      }
      const echo = {
        stamp: modelStamp(payload.value),
        context: contextKey(),
        source: props.source,
      };
      ownEcho = echo;
      // 在两个同步事件之前释放本次锁；父级回写由 watch 识别，不结束多选快速入口。
      guarding.value = false;
      events.update(payload.value);
      events.commit(payload);
      void nextTick(() => {
        if (ownEcho === echo) ownEcho = undefined;
      });
      if (!keepSuggestions) close();
      return true;
    } catch (error) {
      if (ticket.isCurrent() && valid()) guardError.value = report("guard", error);
      return false;
    } finally {
      if (ticket.isCurrent()) guarding.value = false;
    }
  }
  async function commit(row?: Row) {
    if (!row) return commitIds([], "clear");
    const allowed = choiceAvailability(row);
    if (!allowed.allowed) {
      guardError.value = allowed.reason ?? "记录不可用";
      return false;
    }
    const id = props.source.getKey(row);
    const next = props.multiple
      ? changeReferenceSelection(
          committedIds.value,
          [id],
          !committedIds.value.includes(id),
          maximum.value
        )
      : { ids: [id], allowed: true };
    return commitIds(next.ids, "select", !!props.multiple && typing.value);
  }
  function remove(id: Id) {
    return commitIds(changeReferenceSelection(committedIds.value, [id], false).ids);
  }
  function chooseDraft(row: Readonly<Row>) {
    if (locked.value || guarding.value) return;
    const allowed = choiceAvailability(row, true);
    if (!allowed.allowed) {
      guardError.value = allowed.reason ?? "记录不可用";
      return;
    }
    const id = props.source.getKey(row);
    const next = props.multiple
      ? changeReferenceSelection(draftIds.value, [id], !draftIds.value.includes(id), maximum.value)
      : { ids: [id], allowed: true };
    draftIds.value = next.ids;
    draftRecords.value = new Map(draftRecords.value).set(id, cloneRecord(row));
    guardError.value = "";
  }
  function removeDraft(id: Id) {
    if (!guarding.value) draftIds.value = changeReferenceSelection(draftIds.value, [id], false).ids;
  }
  function clearDraft() {
    if (!guarding.value) draftIds.value = [];
  }
  function togglePage() {
    if (guarding.value || searching.value) return;
    const result = changeReferenceSelection(
      draftIds.value,
      pageIds.value,
      !pageAll.value,
      maximum.value
    );
    if (!result.allowed) {
      guardError.value = result.reason ?? "超出可选数量";
      return;
    }
    for (const row of rows.value)
      if (result.ids.includes(props.source.getKey(row)))
        draftRecords.value.set(props.source.getKey(row), cloneRecord(row));
    draftRecords.value = new Map(draftRecords.value);
    draftIds.value = result.ids;
    guardError.value = "";
  }
  function resetSearch() {
    dialogKeyword.value = "";
    conditionValues.value = {};
    queryApplied.value = emptyAppliedQuery();
    page.value = 1;
    void search();
  }
  async function applyQuery(value: AppliedQuery<QuerySchema>) {
    if (!props.source.query) return false;
    const result = applyQueryDraft(
      props.source.query.schema,
      createQueryDraft(props.source.query.schema, value)
    );
    if (!result.valid) {
      searchError.value = result.issues.map((issue) => issue.message).join("；");
      return false;
    }
    queryApplied.value = result.applied;
    page.value = 1;
    await search();
    return true;
  }
  function moveActive(direction: number) {
    if (!typing.value || !suggestions.value.length) return;
    for (let offset = 1; offset <= suggestions.value.length; offset++) {
      const index =
        (activeIndex.value + direction * offset + suggestions.value.length) %
        suggestions.value.length;
      if (choiceAvailability(suggestions.value[index]).allowed) {
        activeIndex.value = index;
        break;
      }
    }
  }
  watch(
    () =>
      [
        props.source,
        contextKey(),
        modelStamp(),
        !!props.multiple,
        JSON.stringify([props.source.key, props.scopeKey]),
      ] as const,
    (current, previous) => {
      const contextChanged =
        !!previous && (current[0] !== previous[0] || current[1] !== previous[1]);
      const echo =
        ownEcho &&
        ownEcho.source === current[0] &&
        ownEcho.context === current[1] &&
        ownEcho.stamp === current[2];
      ownEcho = undefined;
      if (!echo) close();
      else {
        channels.suggest.cancel();
        suggesting.value = false;
      }
      channels.resolve.cancel();
      if (contextChanged) {
        cache.clear();
        resolvedRecords.value = new Map();
      }
      const scopeChanged = !!previous && (current[0] !== previous[0] || current[4] !== previous[4]);
      if (scopeChanged && current[2] === previous[2] && committedIds.value.length) {
        const previousIds = [...committedIds.value],
          value = toValue([]);
        events.update(value);
        events.commit({
          value,
          previousValue: toValue(previousIds),
          items: [],
          addedIds: [],
          removedIds: previousIds,
          reason: "dependency-clear",
        });
        // 等待父级同步应用清空；不能向新范围请求上一范围的 ID。
        resolving.value = false;
        pendingIds.value = [];
        unavailableIds.value = [];
        return;
      }
      void resolveSelection(false);
    },
    { immediate: true }
  );
  watch(locked, (value) => {
    if (value) close();
  });
  watch(
    () =>
      JSON.stringify([
        dialogKeyword.value,
        conditionValues.value,
        queryApplied.value,
        props.maxSelected,
      ]),
    () => {
      if (visible.value) {
        cancelGuard();
        channels.search.cancel();
        searching.value = false;
      }
    },
    { flush: "sync" }
  );
  onBeforeUnmount(() => {
    alive = false;
    close();
    channels.resolve.cancel();
    cache.clear();
  });
  return {
    committedIds,
    modelError,
    selected,
    selectedItems,
    resolvedRecords,
    resolving,
    resolveError,
    unavailable,
    unavailableIds,
    validationUnavailableIds,
    pendingIds,
    typing,
    keyword,
    composing,
    suggestions,
    suggesting,
    suggestError,
    activeIndex,
    visible,
    dialogKeyword,
    conditionValues,
    queryApplied,
    applyQuery,
    rows,
    total,
    page,
    limit,
    searching,
    searchError,
    draft,
    draftIds,
    draftRecords,
    guarding,
    guardError,
    locked,
    label,
    eligible,
    choiceAvailability,
    isSelected,
    pageAll,
    pageSome,
    pageIds,
    stopTyping,
    close,
    resolveSelection,
    suggest,
    input,
    compositionStart,
    search,
    resetSearch,
    open,
    commit,
    remove,
    commitIds,
    chooseDraft,
    removeDraft,
    clearDraft,
    togglePage,
    moveActive,
  };
}
