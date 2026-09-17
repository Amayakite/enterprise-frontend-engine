import type { ComputedRef, InjectionKey } from "vue";

/** 查询面板向嵌套值编辑器提供只读访问范围；不包含请求缓存或可变全局状态。 */
export const queryScopeKey: InjectionKey<ComputedRef<string>> = Symbol("business-query-scope");
