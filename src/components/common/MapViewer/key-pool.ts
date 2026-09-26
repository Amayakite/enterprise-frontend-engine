import type { MapCredential } from "./types";

/** 地图失败分类；业务请求仅在 credential 错误时尝试其它凭证。 */
export class MapServiceError extends Error {
  /** credential 是凭证/权限/配额问题；transient 是网络或 SDK 未就绪。 */
  readonly kind: "credential" | "transient";

  /** message 必须是无凭证的可展示文案；不直接透传请求 URL。 */
  constructor(message: string, kind: "credential" | "transient" = "transient") {
    super(message);
    this.name = "MapServiceError";
    this.kind = kind;
  }
}

/** 清理空白和重复 Key，返回新数组；保留同一 Key 的第一套安全配置。 */
export function normalizeCredentials(entries: readonly MapCredential[]): MapCredential[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const key = entry.key.trim();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ ...entry, key }];
  });
}

/**
 * 从数组中顺序尝试一次，成功即停止；每项最多执行一次，不持久化失败状态。
 * @param entries 已清理的凭证数组；调用方可切片以跳过本轮已失败的 Key。
 * @param attempt 尝试初始化或调用服务；失败抛错，成功返回会话/结果。
 * @param signal 组件卸载或切换厂商时取消，取消后不再试下一个。
 * @returns 首个成功结果；全部失败时抛出不含 Key 的统一错误。
 */
export async function tryMapCredentials<T>(
  entries: readonly MapCredential[],
  attempt: (entry: MapCredential, index: number) => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  for (const [index, entry] of entries.entries()) {
    signal.throwIfAborted();
    try {
      const result = await attempt(entry, index);
      signal.throwIfAborted();
      return result;
    } catch {
      signal.throwIfAborted();
    }
  }
  throw new MapServiceError(
    "所有配置的地图 Key 均未能完成加载，请检查网络、浏览器 WebGL、域名白名单及凭证权限后重试。"
  );
}
