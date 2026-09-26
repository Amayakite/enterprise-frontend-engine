/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_PORT?: string;
  readonly VITE_APP_BASE_API: string;
  readonly VITE_APP_API_URL?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_MOCK_DEV_SERVER?: string;
  readonly VITE_APP_VUE_DEVTOOLS?: string;
  /** 为 true 时将 Word 试用页加入生产验收构建；默认仅开发可见。 */
  readonly VITE_APP_WORD_EDITOR_LAB?: string;
  /** 业务新选址默认厂商；省略为 amap。 */
  readonly VITE_MAP_PROVIDER?: "amap" | "tencent";
  /** 高德浏览器凭证 JSON 数组；实际值只放本地环境配置。 */
  readonly VITE_AMAP_KEYS?: string;
  /** 腾讯浏览器凭证 JSON 数组；实际值只放本地环境配置。 */
  readonly VITE_TENCENT_KEYS?: string;
  /** 同源 OSM 边界服务路径；生产未配置时不启用，不可填写海外公共接口。 */
  readonly VITE_OSM_BOUNDARY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_INFO__: {
  pkg: { name: string; version: string };
};
