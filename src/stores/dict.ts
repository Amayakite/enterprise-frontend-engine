import { defineStore } from "pinia";
import { store } from "@/stores";
import DictAPI from "@/api/system/dict";
import { createDictionaryPool } from "@/utils/dictionary-pool";

/** 仅共享活跃字典请求与选项；无持久缓存，最后一个消费者离开即释放。 */
export const useDictStore = defineStore("dict", () => {
  const pool = createDictionaryPool((code, signal) => DictAPI.getDictItems(code, signal));
  return {
    acquire: pool.acquire,
    refreshScope: pool.refreshScope,
    removeDictItem: pool.refreshCode,
    clearDictCache: pool.clear,
  };
});
/** 非组件场景（如退出登录）取得当前应用的字典 store。 */
export function useDictStoreHook() {
  return useDictStore(store);
}
