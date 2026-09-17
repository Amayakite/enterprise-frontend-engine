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

/** 当前字段宿主的隔离范围；子表和查询输入继承，无跨页面可变状态。 */
export const dictionaryScopeKey: InjectionKey<ComputedRef<string>> = Symbol("dictionary-scope");

/**
 * 同页同编码共用一份在途请求和选项，离开/停用后释放。
 * @param code 字典 key 或 getter；空值不请求。
 * @param scope 可选隔离范围；默认继承字段宿主。
 * @returns options/loading/error 与 reload；失败不改写 v-model。
 * @remarks 无持久缓存；重新进入或 reload 时读取最新数据。
 * @example
 * `const dictionary = useDictionary(() => props.code);`
 */
export function useDictionary(
  code: MaybeRefOrGetter<string | undefined>,
  scope?: MaybeRefOrGetter<string>
) {
  const inherited = inject(dictionaryScopeKey, undefined);
  const store = useDictStore();
  const lease = shallowRef<ReturnType<typeof store.acquire>>();
  let active = true;
  function release() {
    lease.value?.release();
    lease.value = undefined;
  }
  function acquire() {
    release();
    const key = toValue(code)?.trim();
    if (active && key)
      lease.value = store.acquire(
        key,
        scope ? toValue(scope) : (inherited?.value ?? "application")
      );
  }
  watch(() => [toValue(code), scope ? toValue(scope) : inherited?.value], acquire, {
    immediate: true,
  });
  onDeactivated(() => {
    active = false;
    release();
  });
  onActivated(() => {
    if (!active) {
      active = true;
      acquire();
    }
  });
  onScopeDispose(release);
  return {
    options: computed(() => lease.value?.entry.items.value ?? []),
    loading: computed(() => lease.value?.entry.loading.value ?? false),
    error: computed(() => lease.value?.entry.error.value ?? ""),
    reload: () => lease.value?.entry.refresh() ?? Promise.resolve(),
  };
}
