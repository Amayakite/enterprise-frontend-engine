import type { App } from "vue";

import { hasPerm } from "./permission";

/**
 * 注册项目级 Vue 指令。
 *
 * @param app Vue 应用实例。
 * @remarks 当前注册 `v-hasPerm`；新增指令必须同时补充类型、示例和全局注册。
 * @example
 * ```ts
 * const app = createApp(App);
 * setupDirective(app);
 * ```
 */
export function setupDirective(app: App<Element>) {
  // 使 v-hasPerm 在所有组件中都可用
  app.directive("hasPerm", hasPerm);
}
