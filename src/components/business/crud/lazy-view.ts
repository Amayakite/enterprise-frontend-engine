import { defineAsyncComponent, h } from "vue";
import type { Component, VNode } from "vue";

/**
 * 将泛型 SFC 的公开 props 保留到异步渲染；仅擦除 Volar 的编译期上下文参数。
 * @param loader Vue 单文件组件导入函数；props 在调用处由组件原声明推导。
 * @returns Vue 标准异步组件；不包装或执行组件 setup，不增加状态实例。
 * @example
 * `lazyCrudView<Parameters<typeof Form<Model, Entity, Id, Context>>[0]>(() => import("./MyCrudForm.vue"))`
 */
export function lazyCrudView<Props extends object>(
  loader: () => Promise<{
    /** 默认 SFC；额外参数属于模板编译器的类型上下文，不用于手动调用。 */
    default: (props: Props, ...context: never[]) => VNode;
  }>
) {
  return defineCrudAsyncView(async () => {
    const loaded = await loader();
    const component: (props: Props) => VNode = loaded.default;
    return component;
  });
}

/**
 * 公共业务异步视图加载器，提供一致的等待与失败提示。
 * @param loader 当前视图或子表的组件导入；失败不自动重试，避免请求循环。
 * @returns 保留组件类型的 Vue 异步组件，120ms 后显示等待提示。
 * @example
 * `defineCrudAsyncView(() => import("./MyBusinessPageHost.vue"))`
 */
export function defineCrudAsyncView<T extends Component>(
  loader: () => Promise<
    | T
    | {
        /** Vue 模块默认导出。 */
        default: T;
      }
  >
) {
  return defineAsyncComponent<T>({
    delay: 120,
    loadingComponent: () => h("p", { role: "status", "aria-busy": "true" }, "正在加载界面…"),
    errorComponent: () => h("p", { role: "alert" }, "界面加载失败，请刷新页面后重试。"),
    loader,
  });
}
