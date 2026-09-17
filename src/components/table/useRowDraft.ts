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
  const session = shallowRef<{ key: Key; original: Row; draft: Row }>();
  const errors = shallowRef<TableValidation<Row, Key>["errors"]>([]);
  const pending = shallowRef(false);
  const listeners = new Set<() => void>();
  watch(session, () => listeners.forEach((listener) => listener()), { flush: "sync" });
  function subscribeDraft(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function snapshotDraft(fields: readonly FieldKey<Row>[]): TableDraftSnapshot<Row, Key> | null {
    const current = session.value;
    if (!current) return null;
    const values: Partial<Row> = {};
    for (const field of fields) values[field] = cloneModel(current.draft[field]);
    return { rowKey: current.key, values };
  }
  function restoreDraft(snapshot: TableDraftSnapshot<Row, Key>, fields: readonly FieldKey<Row>[]) {
    if (!props.edit || !begin(snapshot.rowKey)) return false;
    const current = session.value!;
    const next = cloneModel(current.original);
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
  let version = 0;
  let validationController: AbortController | undefined;
  let validationRun = 0;
  let committing: Promise<boolean> | undefined;
  const links = computed(() => compileLinks(props.edit ? (props.edit.links ?? []) : []));
  watch(links, () => {}, { immediate: true });
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
  function cancelEdit() {
    finishEdit(false);
  }
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
  async function validate(
    rows: readonly Row[] = props.rows,
    replaceErrors = true
  ): Promise<TableValidation<Row, Key>> {
    const run = version;
    const validation = ++validationRun;
    validationController?.abort();
    validationController = new AbortController();
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
    if (run !== version || validation !== validationRun || !sameModelValue(rows, snapshot))
      return { valid: false, stale: true, errors: [] };
    const checkedErrors = checks.flat();
    const checkedKeys = new Set(snapshot.map((row) => props.getRowKey(row)));
    errors.value = replaceErrors
      ? checkedErrors
      : [...errors.value.filter((error) => !checkedKeys.has(error.rowKey)), ...checkedErrors];
    return { valid: !checkedErrors.length, errors: checkedErrors };
  }
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
        const changes: Partial<Row> = {};
        for (const key of Object.keys(current.draft) as FieldKey<Row>[])
          if (!sameModelValue(current.original[key], current.draft[key]))
            changes[key] = cloneModel(current.draft[key]);
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
  const activeKey = computed(() => session.value?.key);
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
  watch(() => props.context, cancelEdit, { deep: true, flush: "sync" });
  watch(() => props.fields, cancelEdit, { deep: true, flush: "sync" });
  watch(() => props.getRowKey, cancelEdit, { flush: "sync" });
  watch(() => !!props.edit, cancelEdit, { flush: "sync" });
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
