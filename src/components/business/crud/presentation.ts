import type { Component, InjectionKey } from "vue";
import type { CrudTarget } from "./types";

/**
 * 非标签编辑页的异步组件加载器；只在 dialog/drawer 真正打开时执行。
 * @example
 * `component: () => import("./add.vue")`
 */
export type BusinessEditorLoader = () => Promise<{
  /** Vue 页面组件默认导出。 */
  default: Component;
}>;

/**
 * 标签页编辑策略；mode 省略时同样按 tab 处理，路由深链仍可直接访问。
 * component 和 width 可预先保留，切换到容器模式时复用；tab 本身不会消费它们。
 * @example
 * `add: { mode: "tab" }`
 */
export interface BusinessTabEditorOptions {
  /** tab 新标签页；省略时也使用 tab。 */
  mode?: "tab";
  /** 标签页由路由加载页面；可选保留 loader，便于后续切换到容器模式。 */
  component?: BusinessEditorLoader;
  /** 标签页不会消费宽度；可选保留，便于后续切换到容器模式。 */
  width?: string | number;
}

/**
 * 对话框或抽屉编辑策略；必须复用当前模块的 add.vue/edit.vue loader。
 * @example
 * `add: { mode: "drawer", component: () => import("./add.vue") }`
 */
export interface BusinessContainerEditorOptions {
  /** dialog 居中弹窗；drawer 右侧抽屉。 */
  mode: "dialog" | "drawer";
  /** 非标签模式必填；按需加载现有 add.vue/edit.vue，不复制编辑器。 */
  component: BusinessEditorLoader;
  /** 弹窗/抽屉宽度，默认 min(1100px, 94vw)。 */
  width?: string | number;
}

/**
 * 单个新增/编辑入口的呈现策略；默认 tab，非标签模式必须有 loader。
 * @example
 * `edit: { mode: "dialog", component: () => import("./edit.vue") }`
 */
export type BusinessEditorOptions = BusinessTabEditorOptions | BusinessContainerEditorOptions;
/** 表单提供给外层容器的公开离开端口，不暴露私有组件实例。 */
export interface EditorLeavePort {
  /** 校验忙碌/脏状态并提示是否允许关闭；由 useCrudForm 实现。 */
  canLeave: () => Promise<boolean>;
  /** 撤回临时离开许可，例如批量关闭标签被其他页拒绝。 */
  cancelLeaveApproval: () => void;
}
/** 嵌入页面的上下文，useBusinessPage 自动读取。 */
export interface EmbeddedEditorContext {
  /** 固定新增/编辑目标，不从外层列表路由猜测 ID。 */
  target: CrudTarget<string>;
  /** 实例的稳定草稿身份，与同一实体路由页使用相同路径。 */
  instanceKey: string;
  /** 注册表单离开端口，返回卸载清理函数。 */
  register: (port: EditorLeavePort) => () => void;
  /** 保存完成后关闭容器，不把外层列表路由替换成详情。 */
  saved: (id: string) => Promise<void>;
  /** 关闭前由外层再次检查离开端口。 */
  close: () => Promise<void>;
}
/** 当前打开的非路由编辑页，只保留一份实例。 */
export interface PresentedEditor {
  /** 非路由容器形态。 */
  mode: "dialog" | "drawer";
  /** 容器标题。 */
  title: string;
  /** 容器宽度。 */
  width: string | number;
  /** 异步页面组件，按需加载。 */
  component: Component;
  /** 提供给嵌入页的固定上下文。 */
  context: EmbeddedEditorContext;
}
/** 公共容器与导航 hook 的交互合同。 */
export interface BusinessPresentation {
  /** 当前编辑页；null 不挂载任何表单。 */
  readonly current: PresentedEditor | null;
  /** 打开非标签页；编译期保证 loader 存在，运行期仍保护动态配置。 */
  open: (target: CrudTarget<string>, options: BusinessContainerEditorOptions) => Promise<void>;
  /** 询问后关闭；取消保留表单。 */
  close: () => Promise<void>;
  /** 外层标签关闭时只检查，不提前销毁表单。 */
  canLeave: () => Promise<boolean>;
  /** 撤回离开许可。 */
  cancelLeaveApproval: () => void;
}
/** 只在当前容器子树生效；不经全局 store 传表单对象。 */
export const embeddedEditorKey: InjectionKey<EmbeddedEditorContext> = Symbol("business-editor");
