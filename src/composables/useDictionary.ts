import {
  computed,
  inject,
  onActivated,
  onDeactivated,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
} from "vue";
import type { InjectionKey, MaybeRefOrGetter, ComputedRef } from "vue";
import { useDictStore } from "@/stores/dict";

/** 当前字段调用方的隔离范围；子表和查询输入继承，无跨页面可变状态。 */
export const dictionaryScopeKey: InjectionKey<ComputedRef<string>> = Symbol("dictionary-scope");

/**
 * 同页同编码共用一份在途请求和选项，离开/停用后释放。
 * @param code 字典 key 或 getter；空值不请求。
 * @param scope 可选隔离范围；默认继承字段调用方。
 * @returns options/loading/error 与 reload；失败不改写 v-model。
 * @remarks 无持久缓存；重新进入或 reload 时读取最新数据。
 * @example
 * `const dictionary = useDictionary(() => props.code);`
 */
export function useDictionary(
  code: MaybeRefOrGetter<string | undefined>,
  scope?: MaybeRefOrGetter<string>
) {
  /** 上层字段区域提供的字典范围，未显式传 scope 时使用。 */
  const inherited = inject(dictionaryScopeKey, undefined);
  /** 共用字典请求与选项的 Store，相同范围和编码复用一份数据。 */
  const store = useDictStore();
  /** 当前控件对字典的使用凭据，包含选项状态和释放方法。 */
  const lease = shallowRef<ReturnType<typeof store.acquire>>();
  /** 当前控件是否处于前台；停用时不再占用字典请求。 */
  let active = true;
  /** 释放当前控件的字典使用记录，其他控件仍使用时由 Store 继续保留。 */
  function release() {
    lease.value?.release();
    lease.value = undefined;
  }
  /** 释放旧字典后按最新编码及范围申请数据；空编码或后台状态不请求。 */
  function acquire() {
    release();
    const key = toValue(code)?.trim();
    if (active && key)
      lease.value = store.acquire(
        key,
        scope ? toValue(scope) : (inherited?.value ?? "application")
      );
  }
  /** 编码或隔离范围变化时切换字典，首次创建立即申请。 */
  watch(() => [toValue(code), scope ? toValue(scope) : inherited?.value], acquire, {
    immediate: true,
  });
  /** 缓存页隐藏后释放本控件的字典引用。 */
  onDeactivated(() => {
    active = false;
    release();
  });
  /** 从缓存恢复时重新申请字典，首次激活不重复申请。 */
  onActivated(() => {
    if (!active) {
      active = true;
      acquire();
    }
  });
  /** 销毁控件时释放字典引用。 */
  onScopeDispose(release);
  return {
    options: computed(() => lease.value?.entry.items.value ?? []),
    loading: computed(() => lease.value?.entry.loading.value ?? false),
    error: computed(() => lease.value?.entry.error.value ?? ""),
    reload: () => lease.value?.entry.refresh() ?? Promise.resolve(),
  };
}
