import type {} from "@amap/amap-jsapi-types";

// 官方类型包尚未覆盖 PlaceSearch；仅补这一项服务接口，其余 SDK 类型全部使用官方包。
declare global {
  namespace AMap {
    class PlaceSearch {
      constructor(options: { city: string; pageSize: number });
      search(keyword: string, callback: (status: string, result: unknown) => void): void;
    }
  }
  interface Window {
    /** 高德官方 Loader 读取的安全配置。 */
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}
