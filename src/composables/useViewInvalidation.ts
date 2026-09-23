import { shallowRef } from "vue";

/**
 * 页面间的轻量失效标记。
 *
 * 写入页标记对应模块已过期；列表和详情在下次从 KeepAlive 恢复时再读取，避免标签切换
 * 无条件请求，同时不会让已保存的数据长期停留在旧快照。
 */
const revisions = shallowRef<Record<string, number>>({});

/** 禁止空模块 key，避免不同页面误共用同一个刷新标记。 */
function assertKey(key: string) {
  if (!key.trim()) throw new Error("页面失效标记必须提供非空 key");
}

/**
 * 标记指定页面数据已经过期。
 *
 * @param key 页面稳定 key，通常与模块/列表身份一致。
 * @remarks 只递增内存版本，不会请求接口；KeepAlive 列表和详情在激活时自行决定是否刷新。
 * @example
 * `invalidateView("base.customer.list")`
 */
export function invalidateView(key: string) {
  assertKey(key);
  revisions.value = {
    ...revisions.value,
    [key]: (revisions.value[key] ?? 0) + 1,
  };
}

/**
 * 读取页面当前失效版本。
 *
 * @param key 页面稳定 key；不传返回 0。
 * @returns 当前版本号；调用方保存已处理版本即可判断是否需要刷新。
 * @example
 * `const revision = viewInvalidationRevision("base.customer.list")`
 */
export function viewInvalidationRevision(key?: string) {
  if (!key) return 0;
  assertKey(key);
  return revisions.value[key] ?? 0;
}
