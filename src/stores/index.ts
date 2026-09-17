import type { App } from "vue";
import { createPinia, type Pinia } from "pinia";

// 动态页面热更新可能沿循环依赖重新执行本模块，沿用已安装的实例，避免权限读到空 store。
const store: Pinia = import.meta.hot?.data.pinia ?? createPinia();
if (import.meta.hot) import.meta.hot.data.pinia = store;

export function setupStore(app: App<Element>) {
  app.use(store);
}

export * from "./app";
export * from "./dict";
export * from "./permission";
export * from "./settings";
export * from "./tags-view";
export * from "./user";
export { store };
