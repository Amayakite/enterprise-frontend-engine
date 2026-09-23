import type { CrudNavigation } from "./types";
import type {
  BusinessEditorOptions,
  BusinessPresentationOptions,
  BusinessPageComponents,
  BusinessView,
  BusinessViewPresentation,
} from "./presentation";
import type { CrudLayoutOptions } from "./layout";

/** 标准路由页的声明；只存业务约定，不持有登录状态或 Vue Router 实例。 */
export interface BusinessPageOptions<Organization extends string = string> {
  /** 统一展示策略；场景覆盖优先于公共值，最终默认 tab。
   * @example
   * `presentation: { mode: "drawer", detail: { mode: "tab" } }`
   */
  presentation?: BusinessPresentationOptions;
  /** 三种场景的懒加载组件；容器打开时必须有对应 loader，登记时不会加载页面。
   * @example
   * `components: { add: () => import("./add.vue") }`
   */
  components?: BusinessPageComponents;
  /** 内容布局；省略保持原容器。simple 紧凑字段、structured 分区；均铺满可用高度。
   * @example
   * `layout: { preset: "simple", entityLabel: "销售组织" }`
   */
  layout?: CrudLayoutOptions;
  /** 旧新增策略，兼容已有模块；新模块使用 presentation + components。 */
  add?: BusinessEditorOptions;
  /** 旧编辑策略，兼容已有模块；新模块使用 presentation + components。 */
  edit?: BusinessEditorOptions;
  /** 模块列表绝对路径；新增/编辑/详情默认位于其 add、edit/:id、detail/:id。 */
  basePath: string;
  /** 当前组织来源；Mock 可以填固定值，正式项目应提供读取当前组织的函数。 */
  organizationId: Organization | (() => Organization);
  /** 列偏好结构版本；不兼容变更时递增，省略为 1。 */
  preferenceVersion?: string;
  /** 表单与详情栅格列数；默认 3，允许 1/2/3。 */
  columns?: 1 | 2 | 3;
  /** 开发样例提示；省略不显示，不据此判断后端是否正式上线。 */
  notice?: string;
  /** create 导航意图的引导效果；默认 halo，spotlight 背景变暗，false 仅短说明。 */
  guideMode?: "halo" | "spotlight" | false;
}

/**
 * 标准路由映射；用于一个模块的所有页面，不在页面重复拼路径。
 * @param basePath 列表路径，例如 /base/customer。
 * @returns 编码后的 add/edit/detail 路径函数，ID 0 不会丢失。
 * @remarks 仅构造字符串，不导航、不读取全局 route。
 */
export function createBusinessPaths(basePath: string) {
  /** 去掉模块基础路径末尾的斜杠，拼接新增/编辑/详情路径时避免重复分隔符。 */
  const base = basePath.replace(/\/+$/, "");
  if (!base.startsWith("/") || base.includes("?") || base.includes("#"))
    throw new Error("模块 basePath 必须是无 query/hash 的绝对路由路径");
  return {
    /** 模块列表地址。 */
    list: base,
    /** 新增地址；没有实体 ID。 */
    add: `${base}/add`,
    /** 编辑地址；路径段使用 encodeURIComponent。 */
    edit: (id: string | number) => `${base}/edit/${encodeURIComponent(id)}`,
    /** 详情地址；保存回填后可使用该地址。 */
    detail: (id: string | number) => `${base}/detail/${encodeURIComponent(id)}`,
  };
}

/** 页面只覆写有差异的导航命令，其余使用公共路径。 */
export type BusinessNavigationOverrides = Partial<CrudNavigation<string>>;

/** 合并展示策略，不加载组件；调用覆盖 > 场景覆盖 > 模块默认 > tab。
 * @param page 模块轻量页面声明。
 * @param view 要打开的场景。
 * @param override 本次调用覆盖，不修改模块声明。
 * @returns 展示形态、宽度及惰性 loader；容器缺少 loader 由打开入口报错。
 * @example
 * `resolveBusinessPresentation(page, "detail", { mode: "tab" })`
 */
export function resolveBusinessPresentation(
  page: BusinessPageOptions,
  view: BusinessView,
  override: BusinessViewPresentation = {}
) {
  /** 读取旧版新增/编辑显示设置，详情没有旧版对应项。 */
  const legacy = view === "detail" ? undefined : page[view];
  /** 读取新增、编辑和详情共用的显示设置，作为各页面的默认值。 */
  const common = page.presentation;
  /** 当前页面单独覆盖的显示方式，优先于共用默认设置。 */
  const specific = common?.[view];
  return {
    mode: override.mode ?? specific?.mode ?? common?.mode ?? legacy?.mode ?? "tab",
    width: override.width ?? specific?.width ?? common?.width ?? legacy?.width,
    component: page.components?.[view] ?? legacy?.component,
  };
}
