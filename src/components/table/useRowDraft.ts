import { computed, shallowRef, watch, onBeforeUnmount } from "vue";
import { cloneModel, sameModelValue } from "@/components/business/fields/model";
import { compileLinks } from "@/components/business/fields/links";
import { normalizeFields } from "@/components/business/fields/normalize";
import { serializeStableKey } from "@/utils/identity";
import {
  createReferenceValidationBatch,
  validateFieldModel,
} from "@/components/business/fields/validation";
import type { ChangeReason, FieldDefinition, FieldKey } from "@/components/business/fields/types";
import type { TableDraftSnapshot, TableEdit, TableValidation } from "./types";

/** 管理一行的临时编辑数据。确认时校验并发布变化，取消时丢弃草稿；不会直接保存到服务器。 */
export function useRowDraft<Row extends object, Key extends string | number, C>(
  props: {
    rows: readonly Row[];
    getRowKey: (row: Readonly<Row>) => Key;
    fields?: readonly FieldDefinition<Row, C>[];
    context: C;
    edit?: TableEdit<Row, C> | false;
  },
  publish: (key: Key, changes: Partial<Row>) => void,
  onClose?: (key: Key, committed: boolean) => void
) {
  /** 当前编辑行的 ID、原始数据和临时输入；未编辑时为空，比较原始数据可得出真正修改的字段。 */
  const session = shallowRef<{ key: Key; original: Row; draft: Row }>();
  /** 表格校验错误，带行 ID 和字段名，供错误清单和单元格定位。 */
  const errors = shallowRef<TableValidation<Row, Key>["errors"]>([]);
  /** 当前行是否正在确认校验；期间不再接受输入或重复确认。 */
  const pending = shallowRef(false);
  /** 订阅临时行变化的回调，主表可借此保存尚未确认的行草稿。 */
  const listeners = new Set<() => void>();
  /** 临时行替换时同步通知草稿订阅者，确保未点击确认的输入也能被保存。 */
  watch(session, () => listeners.forEach((listener) => listener()), { flush: "sync" });
  /** 订阅行草稿变化并返回取消函数；不在这里读取或保存业务数据。 */
  function subscribeDraft(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  /** 只复制允许保存的字段，并附带行 ID；没有正在编辑的行时返回 null。 */
  function snapshotDraft(fields: readonly FieldKey<Row>[]): TableDraftSnapshot<Row, Key> | null {
    const current = session.value;
    if (!current) return null;
    const values: Partial<Row> = {};
    for (const field of fields) values[field] = cloneModel(current.draft[field]);
    return { rowKey: current.key, values };
  }
  /** 找到原行后恢复允许字段，跳过只读字段并检查行 ID 不变，恢复后仍需正常校验。 */
  function restoreDraft(snapshot: TableDraftSnapshot<Row, Key>, fields: readonly FieldKey<Row>[]) {
    if (!props.edit || !begin(snapshot.rowKey)) return false;
    const current = session.value!;
    const next = cloneModel(current.original);
    // 按当前字段规则跳过只读字段，草稿恢复不能绕过页面现在的编辑限制。
    const readonlyFields = new Set(
      normalizeFields(props.fields ?? [], {
        model: next,
        context: props.context,
        mode: "edit",
      })
        .filter((entry) => entry.form?.readonly)
        .map((entry) => entry.field.key)
    );
    for (const field of fields) {
      if (!readonlyFields.has(field) && Object.hasOwn(snapshot.values, field))
        next[field] = cloneModel(snapshot.values[field]) as Row[typeof field];
    }
    if (props.getRowKey(next) !== current.key) {
      cancelEdit();
      return false;
    }
    session.value = { ...current, draft: next };
    version++;
    return true;
  }
  /** 行数据或编辑会话变化时递增，避免旧校验结果写回新一轮编辑。 */
  let version = 0;
  /** 取消上一轮参照等异步校验，减少已失效的请求。 */
  let validationController: AbortController | undefined;
  /** 区分同一份数据上的多轮校验，只接收最近一轮结果。 */
  let validationRun = 0;
  /** 共享当前确认操作的 Promise，多次点击确认只执行一次校验和回写。 */
  let committing: Promise<boolean> | undefined;
  /** 根据行编辑配置生成同步字段联动规则，编辑草稿时复用。 */
  const links = computed(() => compileLinks(props.edit ? (props.edit.links ?? []) : []));
  /** 创建或改变联动配置时立即检查，避免用户开始输入后才暴露循环规则等错误。 */
  watch(links, () => {}, { immediate: true });
  /** 结束当前编辑，取消未完成校验、清除当前行错误，并通知表格确认还是取消。 */
  function finishEdit(committed: boolean) {
    const key = session.value?.key;
    version++;
    validationRun++;
    validationController?.abort();
    committing = undefined;
    session.value = undefined;
    if (key !== undefined) errors.value = errors.value.filter((error) => error.rowKey !== key);
    pending.value = false;
    if (key !== undefined) onClose?.(key, committed);
  }
  /** 丢弃当前行临时输入；新建行是否删除由上层关闭回调决定。 */
  function cancelEdit() {
    finishEdit(false);
  }
  /** 按稳定 ID 找到唯一行，复制原值和草稿并开始编辑；找不到或重复 ID 时拒绝。 */
  function begin(key: Key) {
    serializeStableKey(key);
    const matching = props.rows.filter((row) => props.getRowKey(row) === key);
    if (matching.length !== 1) return false;
    const row = matching[0];
    if (!props.edit || !row) return false;
    cancelEdit();
    session.value = { key, original: cloneModel(row), draft: cloneModel(row) };
    return true;
  }
  /** 在临时行上应用输入和联动，禁止修改行 ID，并清除该行过时的错误提示。 */
  function patch(changes: Partial<Row>, reason: ChangeReason = "user") {
    const current = session.value;
    if (!current || !props.edit || pending.value) return;
    const result = links.value(
      { model: current.draft, context: props.context, mode: "edit" },
      props.edit.createInitialRow(),
      changes,
      reason
    );
    if (props.getRowKey(result.model) !== current.key) throw new Error("行编辑不能改变稳定行键");
    session.value = { ...current, draft: result.model };
    version++;
    errors.value = errors.value.filter((error) => error.rowKey !== current.key);
  }
  /** 检查指定行集合，共享本轮参照校验请求；数据或校验轮次变化后丢弃结果。 */
  async function validate(
    rows: readonly Row[] = props.rows,
    replaceErrors = true
  ): Promise<TableValidation<Row, Key>> {
    const run = version;
    const validation = ++validationRun;
    validationController?.abort();
    validationController = new AbortController();
    // 本轮所有行共享参照校验批次，同一数据源的校验可合并请求。
    const batch = createReferenceValidationBatch(validationController.signal);
    const snapshot = cloneModel(rows);
    const checks = await Promise.all(
      snapshot.map(async (row) => {
        const result = await validateFieldModel(
          props.fields ?? [],
          { model: row, context: props.context, mode: "edit" },
          batch
        );
        return result.errors.map((error) => ({ ...error, rowKey: props.getRowKey(row) }));
      })
    );
    // 异步校验结束时同时检查编辑版本、校验轮次和原数据，过期错误不写回新一轮编辑。
    if (run !== version || validation !== validationRun || !sameModelValue(rows, snapshot))
      return { valid: false, stale: true, errors: [] };
    const checkedErrors = checks.flat();
    const checkedKeys = new Set(snapshot.map((row) => props.getRowKey(row)));
    errors.value = replaceErrors
      ? checkedErrors
      : [...errors.value.filter((error) => !checkedKeys.has(error.rowKey)), ...checkedErrors];
    return { valid: !checkedErrors.length, errors: checkedErrors };
  }
  /** 对当前草稿校验通过后只发布实际变化字段；失败时保留输入，重复调用共用一次操作。 */
  function commitEdit(): Promise<boolean> {
    if (committing) return committing;
    const current = session.value;
    if (!current) return Promise.resolve(true);
    const run = version;
    pending.value = true;
    const operation = (async () => {
      try {
        const result = await validate([current.draft], false);
        if (!result.valid || run !== version || session.value !== current) return false;
        // 只提取相对原始行真正变化的字段，避免把整行旧值覆盖到父模型。
        const changes: Partial<Row> = {};
        for (const key of Object.keys(current.draft) as FieldKey<Row>[])
          if (!sameModelValue(current.original[key], current.draft[key]))
            changes[key] = cloneModel(current.draft[key]);
        // 先结束编辑会话再发布变化，避免父组件同步回传 rows 被监听器误判为外部冲突。
        finishEdit(true);
        if (Object.keys(changes).length) publish(current.key, changes);
        return true;
      } finally {
        if (run === version) pending.value = false;
      }
    })();
    committing = operation;
    void operation
      .finally(() => {
        if (committing === operation) committing = undefined;
      })
      .catch(() => {});
    return operation;
  }
  /** 当前正在编辑的行 ID，用来只监听这条原始记录，而不是深度监听整张表。 */
  const activeKey = computed(() => session.value?.key);
  /** 原始行被删除或被外部替换后取消旧草稿，避免拿旧数据覆盖新记录。 */
  watch(
    () =>
      activeKey.value === undefined
        ? undefined
        : props.rows.find((row) => props.getRowKey(row) === activeKey.value),
    (row) => {
      const current = session.value;
      if (!current) return;
      if (!row || !sameModelValue(row, current.original)) cancelEdit();
    },
    { deep: true, flush: "sync" }
  );
  // 仅深跟踪当前原始行；逐字修改活动草稿不遍历整张表，也不复制其他行。
  watch(
    () => props.rows,
    () => {
      if (!session.value) version++;
    },
    { flush: "sync" }
  );
  /** 组织等上下文变化后取消当前编辑，防止沿用旧范围的参照和规则。 */
  watch(() => props.context, cancelEdit, { deep: true, flush: "sync" });
  /** 字段规则变化后结束旧编辑，让下一次编辑使用新的配置。 */
  watch(() => props.fields, cancelEdit, { deep: true, flush: "sync" });
  /** 行 ID 的读取方式变化后取消编辑，避免草稿匹配到错误的行。 */
  watch(() => props.getRowKey, cancelEdit, { flush: "sync" });
  /** 行编辑功能开关变化时清理旧草稿。 */
  watch(() => !!props.edit, cancelEdit, { flush: "sync" });
  /** 卸载时清除订阅并取消编辑和异步校验，避免继续回写已销毁表格。 */
  onBeforeUnmount(() => {
    listeners.clear();
    cancelEdit();
  });
  return {
    session,
    errors,
    pending,
    begin,
    patch,
    cancelEdit,
    commitEdit,
    validate,
    snapshotDraft,
    restoreDraft,
    subscribeDraft,
  };
}
