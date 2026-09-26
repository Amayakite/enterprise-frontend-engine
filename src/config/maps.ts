import type { MapCredential, MapProvider } from "@/components/common/MapViewer/types";

/**
 * 解析本地环境变量中的凭证数组；格式错误显式报错，不把配置错误伪装成无 Key。
 * @param value JSON 数组字符串；未配置或空字符串返回空数组。
 * @example
 * parseMapCredentials('[{"key":"your-browser-key"}]')
 */
export function parseMapCredentials(value: unknown): MapCredential[] {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string") throw new Error("地图 Key 配置必须是 JSON 数组字符串");
  const entries: unknown = JSON.parse(value);
  if (!Array.isArray(entries)) throw new Error("地图 Key 配置必须是 JSON 数组");
  return entries.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("key" in entry) ||
      typeof entry.key !== "string"
    ) {
      throw new Error("地图 Key 数组的每一项必须包含字符串 key");
    }
    const credential: MapCredential = { key: entry.key };
    if ("securityJsCode" in entry) {
      if (typeof entry.securityJsCode !== "string")
        throw new Error("地图配置 securityJsCode 必须是字符串");
      credential.securityJsCode = entry.securityJsCode;
    }
    if ("serviceHost" in entry) {
      if (typeof entry.serviceHost !== "string")
        throw new Error("地图配置 serviceHost 必须是字符串");
      credential.serviceHost = entry.serviceHost;
    }
    return credential;
  });
}

/**
 * 读取对应厂商的 Key 数组，供地图组件使用；没有默认真实凭证。
 * 在 .env.development.local 设置 VITE_AMAP_KEYS / VITE_TENCENT_KEYS 后重启开发服务。
 * VITE 变量会进入浏览器，不能存储服务端密钥。
 */
export function getMapCredentials(provider: MapProvider): MapCredential[] {
  return parseMapCredentials(
    provider === "amap" ? import.meta.env.VITE_AMAP_KEYS : import.meta.env.VITE_TENCENT_KEYS
  );
}

/** 业务选址默认厂商；VITE_MAP_PROVIDER 省略时为高德，已有位置仍按其原厂商回显。 */
export function getDefaultMapProvider(): MapProvider {
  const provider = import.meta.env.VITE_MAP_PROVIDER || "amap";
  if (provider !== "amap" && provider !== "tencent")
    throw new Error("地图厂商仅支持 amap 或 tencent");
  return provider;
}
