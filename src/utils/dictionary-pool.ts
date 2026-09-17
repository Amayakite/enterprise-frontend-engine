import { shallowRef } from "vue";
import type { DictItemOption } from "@/api/system/dict/types";

/** 当前消费者生命周期内共享字典；零消费者即释放，不读写 localStorage。 */
export function createDictionaryPool(
  load: (code: string, signal: AbortSignal) => Promise<DictItemOption[]>
) {
  const entries = new Map<string, ReturnType<typeof createEntry>>();
  function createEntry(code: string, scope: string) {
    const items = shallowRef<readonly DictItemOption[]>([]);
    const loading = shallowRef(false);
    const error = shallowRef("");
    let consumers = 0;
    let request: Promise<void> | undefined;
    let controller: AbortController | undefined;
    let revision = 0;
    const refresh = () => {
      if (request) return request;
      const run = ++revision;
      controller = new AbortController();
      loading.value = true;
      error.value = "";
      const signal = controller.signal;
      request = Promise.resolve()
        .then(() => load(code, signal))
        .then((data) => {
          if (run === revision)
            items.value = Object.freeze(data.map((item) => Object.freeze({ ...item })));
        })
        .catch((cause) => {
          if (run === revision) {
            items.value = [];
            error.value = cause instanceof Error ? cause.message : "字典加载失败";
          }
        })
        .finally(() => {
          if (run === revision) {
            loading.value = false;
            request = undefined;
          }
        });
      return request;
    };
    return {
      code,
      scope,
      items,
      loading,
      error,
      refresh,
      retain() {
        consumers++;
      },
      release() {
        return --consumers;
      },
      dispose() {
        revision++;
        controller?.abort();
        request = undefined;
        items.value = [];
        loading.value = false;
      },
    };
  }
  return {
    /** 同范围/编码只发一次在途请求；返回 release，宿主卸载/停用时必须调用。 */
    acquire(code: string, scope: string) {
      const key = JSON.stringify([scope, code]);
      let entry = entries.get(key);
      if (!entry) {
        entry = createEntry(code, scope);
        entries.set(key, entry);
        void entry.refresh();
      }
      entry.retain();
      const current = entry;
      let released = false;
      return {
        entry,
        release() {
          if (released) return;
          released = true;
          if (current.release() === 0) {
            current.dispose();
            if (entries.get(key) === current) entries.delete(key);
          }
        },
      };
    },
    /** 刷新当前范围活跃字典；不加载无人使用的历史编码。 */
    refreshScope(scope: string) {
      return Promise.all(
        [...entries.values()].filter((e) => e.scope === scope).map((e) => e.refresh())
      );
    },
    /** 维护成功后刷新活跃消费者；关闭的页面下次进入重新读取。 */
    refreshCode(code: string) {
      return Promise.all(
        [...entries.values()].filter((e) => e.code === code).map((e) => e.refresh())
      );
    },
    /** 注销时取消请求，旧响应不能重新填充。 */
    clear() {
      entries.forEach((e) => e.dispose());
      entries.clear();
    },
    /** 当前活跃条目数，仅用于生命周期诊断。 */
    get size() {
      return entries.size;
    },
  };
}
