import { createBusinessPaths } from "@/components/business/crud/page";

/** 业务导航目标元信息；登记不代表授权，不加载页面组件。 */
export interface BusinessTarget {
  /** 稳定模块标识，例如 customer；不使用显示标题。 */
  key: string;
  /** 供查看、新增和受限提示使用的实体名称。 */
  title: string;
  /** 模块列表的绝对路径，不含查询参数。 */
  list: string;
  /** 可选新增路径；省略时该目标不支持 create 意图。 */
  add?: string;
  /** 可选详情路径构造器；ID 仅在 URL 边界编码。 */
  detail?: (id: string | number) => string;
  /** 验证本目标拥有的路径；只匹配明确页面，不作为授权。 */
  matches: (path: string) => boolean;
}

const customerPaths = createBusinessPaths("/base/customer");
/** 客户的轻量页面目标；模块配置复用 list，不反向导入 config。
 * @example
 * `open({ target: customerTarget.key, action: "create" })`
 */
export const customerTarget: BusinessTarget = {
  key: "customer",
  title: "客户",
  ...customerPaths,
  matches: (path) =>
    path === customerPaths.list ||
    path === customerPaths.add ||
    /^\/base\/customer\/(?:edit|detail)\/[^/]+$/.test(path),
};
const salePaths = createBusinessPaths("/base/sale");
/** 销售组织的配置化跳转目标；登记不代表授权。 */
export const saleTarget: BusinessTarget = {
  key: "sale",
  title: "销售组织",
  ...salePaths,
  matches: (path) =>
    path === salePaths.list ||
    path === salePaths.add ||
    /^\/base\/sale\/(?:edit|detail)\/[^/]+$/.test(path),
};
const targets: readonly BusinessTarget[] = [customerTarget, saleTarget];

/** 从显式目标表查找元信息；未知 key 返回 undefined，不猜测页面路径。
 * @example
 * `getBusinessTarget("customer")`
 */
export function getBusinessTarget(key: string) {
  return targets.find((target) => target.key === key);
}

/** 判断未匹配路由是否属于已知业务目标；与菜单是否显示无关。
 * @example
 * `findBusinessTarget("/base/customer/detail/C001")`
 */
export function findBusinessTarget(path: string) {
  return targets.find((target) => target.matches(path));
}

/** 来源参照可以发出的导航请求；不是保存指令或权限凭证。 */
export interface BusinessNavigationRequest {
  /** 已登记目标 key。 */
  target: string;
  /** create 到列表引导；view 到详情（有 id 时）或列表，默认 view。 */
  action?: "create" | "view";
  /** 查看记录的原始 ID，0 有效；省略时打开列表。 */
  id?: string | number;
}
