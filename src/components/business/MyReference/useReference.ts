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
  /** 记住创建时的单选/多选模式；两种值结构不同，运行中切换需重建组件。 */
  const initialMultiple = !!props.multiple;
  /** 检查传入值是否符合单选或多选要求，并统一转为 ID 数组；非法值显示错误而不继续查询。 */
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
  /** 父页面已经确认的 ID 集合，和弹窗里尚未点击确定的临时选择分开。 */
  const committedIds = computed(() => model.value.ids);
  /** 传入模型类型或单多选配置不匹配时的说明，此时禁止继续选择。 */
  const modelError = computed(() => model.value.error);
  /** 已选 ID 对应的记录，供标签和名称回显使用；范围变化时重新读取。 */
  const resolvedRecords = shallowRef(new Map<Id, Row>());
  // Map 整体由一个上下文持有；范围改变立即清空，不可能复用另一组织的条目。
  const cache = new Map<Id, Row>();
  /** 已选记录是否正在回显及其错误文案，和候选搜索的状态独立。 */
  const resolving = ref(false),
    resolveError = ref("");
  /** 提交前复核发现的失效 ID，用于在弹窗中标记需要重新选择的记录。 */
  const validationUnavailableIds = shallowRef<Id[]>([]);
  /** 已确认但已失效的 ID，以及尚未解析完的 ID；分别用于不可用与加载提示。 */
  const unavailableIds = shallowRef<Id[]>([]),
    pendingIds = shallowRef<Id[]>([]);
  /** 只要已选 ID 中有失效记录，就不能把当前回显当作完整有效选择。 */
  const unavailable = computed(() => unavailableIds.value.length > 0);
  /** 按已选 ID 的顺序还原已解析记录，不改变用户选择顺序。 */
  const selectedItems = computed(() =>
    committedIds.value.flatMap((id) => {
      const item = resolvedRecords.value.get(id);
      return item ? [item] : [];
    })
  );
  /** 单选显示的第一条已解析记录；加载中或空值时可能不存在。 */
  const selected = computed(() => selectedItems.value[0]);
  /** 输入候选搜索的开关、关键词及输入法组合状态；组合输入结束前不发搜索。 */
  const typing = ref(false),
    keyword = ref(""),
    composing = ref(false);
  /** 输入框下的候选、加载状态、错误和键盘高亮位置，与弹窗列表相互独立。 */
  const suggestions = shallowRef<Row[]>([]),
    suggesting = ref(false),
    suggestError = ref(""),
    activeIndex = ref(-1);
  /** 选择弹窗的开关及弹窗自己的关键词，打开后不会复用输入框的临时选择。 */
  const visible = ref(false),
    dialogKeyword = ref("");
  /** 旧式参照搜索表单中的各字段值，提交查询前转换成有效条件。 */
  const conditionValues = ref<Record<string, QueryValue>>({});
  /** 支持新查询面板的数据源当前已应用条件，翻页时继续使用。 */
  const queryApplied = shallowRef<AppliedQuery<QuerySchema>>(emptyAppliedQuery());
  /** 把非空搜索输入转换为接口条件，未填写的项不参与过滤。 */
  const conditions = computed<ReferenceCondition[]>(() =>
    (props.source.searchFields ?? []).flatMap((field) => {
      const value = conditionValues.value[field.key];
      return isEmptyValue(value) ? [] : [{ key: field.key, operator: field.operator, value }];
    })
  );
  /** 弹窗当前页记录、总数、页码和每页条数，只用于候选列表展示。 */
  const rows = shallowRef<Row[]>([]),
    total = ref(0),
    page = ref(1),
    limit = ref(10);
  /** 弹窗列表是否正在查询及其错误，不影响已确认值的回显状态。 */
  const searching = ref(false),
    searchError = ref("");
  /** 弹窗里暂选的 ID 与记录；点击确定才回写父页面，取消时全部丢弃。 */
  const draftIds = shallowRef<Id[]>([]),
    draftRecords = shallowRef(new Map<Id, Row>());
  /** 单选弹窗当前暂选记录，供选中预览使用。 */
  const draft = computed(() =>
    draftIds.value.length ? draftRecords.value.get(draftIds.value[0]) : undefined
  );
  /** 打开或确认前的业务检查状态和失败原因，检查期间避免重复提交选择。 */
  const guarding = ref(false),
    guardError = ref("");
  /** 为候选搜索、弹窗查询和已选回显各自管理取消和请求顺序，互不挤掉彼此的请求。 */
  const channels = {
    suggest: createReferenceChannel(),
    search: createReferenceChannel(),
    resolve: createReferenceChannel(),
  };
  // 守卫中的最终有效性请求独立取消，不能挤掉已提交值的展示回显。
  const guardChannel = createReferenceChannel();
  /** 输入或弹窗操作轮次，以及组件是否仍存在；旧异步回调必须确认自己仍属于当前轮次。 */
  let session = 0,
    alive = true;
  /** 禁用、只读或模型错误时锁住选择操作，仍可保留原值显示。 */
  const locked = computed(() => !!props.disabled || !!props.readonly || !!modelError.value);
  /** 当前允许选择的最大数量；单选固定为 1，多选未配置上限时不限制。 */
  const maximum = computed(() => (props.multiple ? (props.maxSelected ?? Infinity) : 1));
  /** 生成输入框显示文字，区分未选、加载、不可用、错误和多选数量。 */
  const label = computed(() => {
    if (!committedIds.value.length) return "";
    if (props.multiple) return `已选 ${committedIds.value.length} 项`;
    if (resolveError.value) return "回显失败";
    if (unavailable.value) return "记录不可用";
    return selected.value ? props.source.getLabel(selected.value) : "加载中";
  });
  /** 调用数据源的可选性规则，例如排除停用记录；未配置规则时允许选择。 */
  const eligible = (row: Readonly<Row>) => props.source.selectable?.(row) ?? { allowed: true };
  /** 按 ID 判断一条记录是否已选，可选择检查正式值或弹窗暂选值。 */
  function isSelected(row: Readonly<Row>, inDraft = false) {
    return (inDraft ? draftIds.value : committedIds.value).includes(props.source.getKey(row));
  }
  /** 合并记录可选性和数量上限；多选中已经选中的记录仍允许取消。 */
  function choiceAvailability(row: Readonly<Row>, inDraft = false) {
    if (props.multiple && isSelected(row, inDraft)) return { allowed: true };
    const allowed = eligible(row);
    if (!allowed.allowed) return allowed;
    return (inDraft ? draftIds.value : committedIds.value).length >= maximum.value && props.multiple
      ? { allowed: false, reason: `最多选择 ${maximum.value} 项` }
      : allowed;
  }
  /** 当前页允许选择的 ID，页头全选不包含禁用记录。 */
  const pageIds = computed(() =>
    rows.value.filter((row) => eligible(row).allowed).map(props.source.getKey)
  );
  /** 当前页所有可选记录是否都在暂选集合中，控制全选框勾选。 */
  const pageAll = computed(
    () => pageIds.value.length > 0 && pageIds.value.every((id) => draftIds.value.includes(id))
  );
  /** 当前页只选了一部分可选记录时显示全选框的半选状态。 */
  const pageSome = computed(
    () => !pageAll.value && pageIds.value.some((id) => draftIds.value.includes(id))
  );
  /** 将数据源、用户组织范围和固定条件组合成比较标识，防止旧范围的结果被复用。 */
  const contextKey = () =>
    JSON.stringify([props.source.key, props.scopeKey, referenceFilterKey(props.filters)]);
  /** 序列化当前选择以比较请求期间值是否改变，同时保留数字和字符串 ID 的差异。 */
  const modelStamp = (value: ReferenceValue<Id, Multiple> = props.modelValue) =>
    JSON.stringify(value);
  /** 记住组件自己刚发布的值，父组件把它传回时无需把它当作外部替换重新处理。 */
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
         * 参照数据源配置；提供稳定 key、行主键/名称、搜索和 ID 回显方法。创建对象本身不发请求。
         * @example
         * `source: provinceReference`
         */
        source: typeof props.source;
      }
    | undefined;
  /** 记录请求发起时的数据源、范围、值和操作轮次，返回检查函数以丢弃过期结果。 */
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
  /** 复制当前固定条件，使异步请求不会读到之后被页面修改的筛选对象。 */
  function snapshotFilters(): F {
    return JSON.parse(referenceFilterKey(props.filters)) as F;
  }
  /** 去掉 Vue 代理后复制记录，避免缓存、插槽或事件接收方互相修改数据。 */
  function cloneRecord(row: Readonly<Row>): Row {
    return structuredClone(toRaw(row)) as Row;
  }
  /** 按业务 ID 保存当前范围内的记录副本，供后续已选值回显。 */
  function cacheRecords(items: readonly Row[]) {
    for (const row of items) cache.set(props.source.getKey(row), cloneRecord(row));
  }
  /** 把内部 ID 数组还原为公开值：单选为 ID/null，多选为数组。 */
  function toValue(ids: readonly Id[]): ReferenceValue<Id, Multiple> {
    // 判别模式在运行期固定；边界转换保留 source 的 Id 类型关联。
    return (props.multiple ? [...ids] : (ids[0] ?? null)) as ReferenceValue<Id, Multiple>;
  }
  /** 向页面报告错误发生在哪一步，并生成可以在组件内显示的文案。 */
  function report(phase: ReferenceError["phase"], error: unknown) {
    events.error({ phase, error });
    return error instanceof Error ? error.message : "请求失败，请重试";
  }
  /** 取消正在执行的确认前检查并结束忙碌状态，防止旧检查继续提交选择。 */
  function cancelGuard() {
    guardChannel.cancel();
    guarding.value = false;
  }
  /** 结束输入候选模式、取消候选请求和确认检查，并清空键盘高亮。 */
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
  /** 关闭弹窗时取消查询并丢弃暂选；已经确认的父页面值保持不变。 */
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
  /** 批量解析 ID，并检查返回数据和可选性，把停用记录也列为不可用。 */
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
  /** 通知页面目前哪些已选记录已解析、不可用或仍在加载；这不是用户选择事件。 */
  function emitResolved() {
    events.resolve({
      items: selectedItems.value
        .filter((row) => !pendingIds.value.includes(props.source.getKey(row)))
        .map(cloneRecord),
      unavailableIds: [...unavailableIds.value],
      pendingIds: [...pendingIds.value],
    });
  }
  /** 读取已选 ID 的记录并更新名称；返回是否仍有效，供保存前校验使用，旧响应不会覆盖新选择。 */
  async function resolveSelection(force = true) {
    const ticket = channels.resolve.start(),
      valid = capture(false),
      ids = [...committedIds.value];
    if (modelError.value) return { allowed: false, reason: modelError.value };
    // 普通回显可复用当前范围缓存；强制校验仍重新读取所有 ID 的可用状态。
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
      // 先移除本轮检查的旧缓存，再存入有效记录，防止已停用项继续显示旧名称。
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
  /** 达到最小输入长度后查询候选；忽略输入法组合、只读及已结束的输入轮次。 */
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
  /** 对连续键入延迟搜索，减少每敲一个字都请求接口；实际执行时仍检查当前输入状态。 */
  const delayedSuggest = useDebounceFn(
    (valid: () => boolean) => {
      if (valid()) void suggest();
    },
    () => props.debounceMs ?? 250
  );
  /** 接收最新关键词、清理旧候选状态，并安排新的延迟搜索。 */
  function input(text: string) {
    stopTyping();
    typing.value = true;
    keyword.value = text;
    suggestError.value = "";
    guardError.value = "";
    suggesting.value = normalizeSearchText(text).length >= (props.minChars ?? 1);
    void delayedSuggest(capture());
  }
  /** 进入中文等输入法组合阶段，暂停候选请求，避免搜索尚未确认的拼音。 */
  function compositionStart() {
    const text = typing.value ? keyword.value : label.value;
    stopTyping();
    keyword.value = text;
    typing.value = true;
    composing.value = true;
  }
  /** 按弹窗关键词、条件和页码读取候选列表，保留已有暂选并处理过期请求。 */
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
  /** 执行打开前检查，准备当前选择的临时副本，然后打开弹窗并加载候选。 */
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
  /** 复核准备提交的 ID、可选性和业务检查；通过后发布新值及完整选择变化事件。 */
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
      // 确认选择前重新按 ID 读取并检查可选性，不直接信任之前搜索出来的候选。
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
      // 选择集合没变时仅更新回显，不重复发出业务选择变化事件。
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
      // 将独立副本交给业务检查；检查期间选择或范围变化，就放弃这次确认。
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
  /** 把点击候选或清空操作转换为目标 ID 集合，统一经过 commitIds 检查。 */
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
  /** 从正式多选值移除一个 ID，仍执行与选择确认相同的业务检查。 */
  function remove(id: Id) {
    return commitIds(changeReferenceSelection(committedIds.value, [id], false).ids);
  }
  /** 更新弹窗暂选记录；只改临时选择，暂不回写父页面。 */
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
  /** 从弹窗暂选中移除指定 ID，不改变已确认值。 */
  function removeDraft(id: Id) {
    if (!guarding.value) draftIds.value = changeReferenceSelection(draftIds.value, [id], false).ids;
  }
  /** 清空弹窗的临时选择，直到确认前都可以取消操作。 */
  function clearDraft() {
    if (!guarding.value) draftIds.value = [];
  }
  /** 只切换当前页可选记录的暂选状态，保留其他页已选项并遵守数量上限。 */
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
  /** 清空弹窗搜索条件并回到第一页重新查询。 */
  function resetSearch() {
    dialogKeyword.value = "";
    conditionValues.value = {};
    queryApplied.value = emptyAppliedQuery();
    page.value = 1;
    void search();
  }
  /** 应用新查询面板的条件后回到第一页，使用数据源声明的查询接口。 */
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
  /** 上下键移动候选高亮位置，供 Enter 确认当前候选。 */
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
  /** 数据源、组织范围或外部值变化后取消旧请求并重新回显；范围真正切换时清空旧选择，自身回传则不关闭当前选择过程。 */
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
  /** 进入只读、禁用或模型错误状态时关闭选择界面，不允许继续提交临时选择。 */
  watch(locked, (value) => {
    if (value) close();
  });
  /** 弹窗条件或数量上限变化后取消旧查询和确认检查，等待下一次明确查询或确认。 */
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
  /** 卸载时关闭暂选、取消回显请求并清空本组件缓存，防止迟到结果回写。 */
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
