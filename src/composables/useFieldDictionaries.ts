import { computed, inject, onActivated, onDeactivated, onScopeDispose, provide, watch } from "vue";
import { dictionaryScopeKey } from "./useDictionary";
import { useDictStore } from "@/stores/dict";
import type { FieldDefinition } from "@/components/business/fields/types";

/**
 * 自动扫描静态字典 key 预热；动态 key 由实际字段按模型读取。
 * @remarks 预热和每行 DictTag 共用租约；无需另维护清单，不保留历史页字典。
 * @example
 * `useFieldDictionaries(() => props.fields, () => props.context);`
 */
export function useFieldDictionaries<M, C>(
  fields: () => readonly FieldDefinition<M, C>[],
  context: () => C
) {
  const inherited = inject(dictionaryScopeKey, undefined);
  const scope = computed(() => {
    const value = context();
    return value &&
      typeof value === "object" &&
      "scopeKey" in value &&
      typeof value.scopeKey === "string"
      ? value.scopeKey
      : (inherited?.value ?? "application");
  });
  provide(dictionaryScopeKey, scope);
  const store = useDictStore();
  let leases: ReturnType<typeof store.acquire>[] = [];
  let active = true;
  function release() {
    leases.forEach((x) => x.release());
    leases = [];
  }
  function preload() {
    release();
    if (!active) return;
    const codes = new Set(
      fields().flatMap((f) =>
        f.type === "dict" && typeof f.dict.code === "string" ? [f.dict.code] : []
      )
    );
    leases = [...codes].filter(Boolean).map((code) => store.acquire(code, scope.value));
  }
  watch(() => [fields(), scope.value], preload, { immediate: true });
  onDeactivated(() => {
    active = false;
    release();
  });
  onActivated(() => {
    if (!active) {
      active = true;
      preload();
    }
  });
  onScopeDispose(release);
  return { refresh: () => store.refreshScope(scope.value) };
}
