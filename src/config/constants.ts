export const APP_PREFIX = "vea";

export const ROLE_ROOT = "ROOT";

export const STORAGE_KEYS = {
  // 认证
  ACCESS_TOKEN: `${APP_PREFIX}:auth:access_token`,
  REFRESH_TOKEN: `${APP_PREFIX}:auth:refresh_token`,
  REMEMBER_ME: `${APP_PREFIX}:auth:remember_me`,

  // 系统
  DICT_CACHE: `${APP_PREFIX}:system:dict_cache`,

  // UI 设置
  THEME: `${APP_PREFIX}:ui:theme`,
  THEME_PRIMARY: `${APP_PREFIX}:ui:theme_primary`,

  // 应用状态
  DEVICE: `${APP_PREFIX}:app:device`,
  SIZE: `${APP_PREFIX}:app:size`,
  SIDEBAR_STATUS: `${APP_PREFIX}:app:sidebar_status`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
