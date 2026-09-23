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
  /** 父字段区域提供的范围，本区域 context 没有 scopeKey 时继承。 */
  const inherited = inject(dictionaryScopeKey, undefined);
  /** 本区域共用的字典隔离范围，并继续提供给下级字段控件。 */
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
  /** 共用字典 Store，预加载与字段实际使用合并请求。 */
  const store = useDictStore();
  /** 本区域为静态字典预加载持有的使用凭据，字段变化或隐藏时释放。 */
  let leases: ReturnType<typeof store.acquire>[] = [];
  /** 区域是否处于前台，后台期间不预加载字典。 */
  let active = true;
  /** 释放本区域全部预加载引用，不干涉其他区域仍在使用的字典。 */
  function release() {
    leases.forEach((x) => x.release());
    leases = [];
  }
  /** 从字段声明提取并去重静态字典编码；动态编码由实际字段控件处理。 */
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
  /** 字段集合或范围变化后重建预加载引用，首次创建立即执行。 */
  watch(() => [fields(), scope.value], preload, { immediate: true });
  /** 缓存区域隐藏后释放预加载字典引用。 */
  onDeactivated(() => {
    active = false;
    release();
  });
  /** 区域重新显示后恢复预加载，避免首次激活重复申请。 */
  onActivated(() => {
    if (!active) {
      active = true;
      preload();
    }
  });
  /** 区域销毁时释放剩余引用。 */
  onScopeDispose(release);
  return { refresh: () => store.refreshScope(scope.value) };
}
