import "vue-router";

declare module "vue-router" {
  /**
   * 项目路由元信息扩展
   */
  interface RouteMeta {
    title?: string;
    /** 菜单搜索别名；默认无，支持业务简称或英文关键词，不授予路由权限。 */
    searchAliases?: string[];
    type?: string;
    icon?: string;
    hidden?: boolean;
    alwaysShow?: boolean;
    affix?: boolean;
    keepAlive?: boolean;
    breadcrumb?: boolean;
    activeMenu?: string;
    params?: Record<string, unknown>;
    externalUrl?: string;
    roles?: string[];
  }
}
