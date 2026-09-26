import { MapServiceError } from "../key-pool";
import type { MapPlace, MapPoint } from "../types";
/** 为 SDK 的回调添加超时和取消；结束后移除取消监听，忽略迟到的回调。 */
export function waitFor<T>(
  signal: AbortSignal,
  start: (resolve: (value: T) => void, reject: (error: Error) => void) => void,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error !== undefined) reject(error);
      else if (value !== undefined) resolve(value);
    };
    const abort = () => finish(new DOMException("地图操作已取消", "AbortError"));
    const timer = setTimeout(() => finish(new MapServiceError(message)), 15000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    try {
      start(
        (value) => finish(undefined, value),
        (error) => finish(error)
      );
    } catch {
      finish(new MapServiceError("地图 SDK 执行失败，请检查浏览器 WebGL 与配置"));
    }
  });
}

/** 校验 SDK 返回的坐标，拒绝缺失和非有限数值。 */
export function isPoint(value: unknown): value is MapPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "lng" in value &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    "lat" in value &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat)
  );
}

/** 将高德不同形状的结果归一化；错误只保留状态码，不回显 SDK 原始内容或 URL。 */
export function amapPlaces(status: string, result: unknown): MapPlace[] {
  if (status === "no_data") return [];
  if (status !== "complete") {
    const info =
      typeof result === "object" && result !== null && "info" in result
        ? String(result.info)
        : typeof result === "string"
          ? result
          : "UNKNOWN_ERROR";
    const credential =
      /INVALID_USER_KEY|INVALID_USER_SCODE|INVALID_USER_DOMAIN|USERKEY_PLAT_NOMATCH|SERVICE_NOT_AVAILABLE|USER_DAILY_QUERY_OVER_LIMIT|ACCESS_TOO_FREQUENT|INSUFFICIENT_PRIVILEGES/.test(
        info
      );
    throw new MapServiceError(
      credential ? "高德凭证、权限或额度不可用" : "高德搜索失败，请稍后重试",
      credential ? "credential" : "transient"
    );
  }
  if (typeof result !== "object" || result === null || !("poiList" in result)) return [];
  const list = result.poiList;
  if (typeof list !== "object" || list === null || !("pois" in list) || !Array.isArray(list.pois))
    return [];
  return list.pois.flatMap((poi: unknown): MapPlace[] => {
    if (
      typeof poi !== "object" ||
      poi === null ||
      !("location" in poi) ||
      !isPoint(poi.location) ||
      !("name" in poi) ||
      typeof poi.name !== "string"
    )
      return [];
    return [
      {
        id: "id" in poi && typeof poi.id === "string" ? poi.id : undefined,
        name: poi.name,
        address: "address" in poi && typeof poi.address === "string" ? poi.address : "",
        point: { lng: poi.location.lng, lat: poi.location.lat },
      },
    ];
  });
}

/** 腾讯服务明确返回鉴权/额度错误才换 Key，参数与网络错误不会轮转。 */
export function tencentError(value: unknown): MapServiceError {
  const status =
    typeof value === "object" && value !== null && "status" in value ? Number(value.status) : -1;
  const credential = [110, 111, 112, 113, 120, 121, 190, 311].includes(status);
  const reasons: Record<number, string> = {
    110: "请求来源未授权",
    111: "签名校验失败",
    112: "IP 未授权",
    113: "功能未授权",
    120: "每秒请求量达到上限",
    121: "每日调用量达到上限",
    190: "无效 Key",
    311: "Key 格式错误",
  };
  return new MapServiceError(
    credential
      ? `腾讯搜索失败（${status}：${reasons[status]}）`
      : "腾讯搜索失败，请检查城市和网络后重试",
    credential ? "credential" : "transient"
  );
}
