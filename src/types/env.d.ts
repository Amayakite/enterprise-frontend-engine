/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_PORT?: string;
  readonly VITE_APP_BASE_API: string;
  readonly VITE_APP_API_URL?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_MOCK_DEV_SERVER?: string;
  readonly VITE_APP_VUE_DEVTOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_INFO__: {
  pkg: { name: string; version: string };
};
