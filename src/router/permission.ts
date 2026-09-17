import { isNavigationFailure, NavigationFailureType, type RouteRecordRaw } from "vue-router";
import { findBusinessTarget } from "./business-targets";
import {
  navigationMailbox,
  parseNavigationIntent,
  stripNavigationQuery,
} from "./navigation-intent";
import NProgress from "@/router/nprogress";
import router from "@/router";
import { usePermissionStore, useUserStore } from "@/stores";

/**
 * 路由权限守卫
 *
 * 处理登录验证、动态路由生成、404检测等
 */
export function setupPermissionGuard() {
  const whiteList = ["/login"];

  router.beforeEach(async (to, _from) => {
    NProgress.start();

    try {
      const isLoggedIn = useUserStore().isLoggedIn();

      // 未登录处理
      if (!isLoggedIn) {
        if (whiteList.includes(to.path)) {
          return;
        }
        NProgress.done();
        return `/login?redirect=${encodeURIComponent(to.fullPath)}`;
      }

      // 已登录访问登录页，重定向到首页
      if (to.path === "/login") {
        return { path: "/" };
      }

      const permissionStore = usePermissionStore();
      const userStore = useUserStore();

      // 动态路由生成
      if (!permissionStore.isRouteGenerated) {
        if (!userStore.userInfo?.roles?.length) {
          await userStore.getUserInfo();
        }

        const dynamicRoutes = await permissionStore.generateRoutes();
        dynamicRoutes.forEach((route: RouteRecordRaw) => {
          router.addRoute(route);
        });

        return { ...to, replace: true };
      }

      // 临时导航意图在页面挂载前规范化，避免污染标签/KeepAlive/草稿身份。
      const knownTarget = findBusinessTarget(to.path);
      const intent = parseNavigationIntent(to.path, to.query);
      const restricted = to.matched.length === 0 && knownTarget;
      const clean = {
        path: restricted ? "/401" : to.path,
        query: stripNavigationQuery(to.query),
        hash: to.hash,
      };
      if (restricted) clean.query = {};
      const destination = router.resolve(clean).fullPath;
      if (intent) navigationMailbox.stage({ ...intent, destination });
      if (
        restricted ||
        Object.keys(to.query).some((key) =>
          ["__navTarget", "__navAction", "__navToken"].includes(key)
        )
      ) {
        if (restricted && !intent)
          navigationMailbox.stage({
            token: crypto.randomUUID(),
            target: knownTarget.key,
            action: "view",
            destination,
          });
        return { ...clean, replace: true };
      }

      // 路由 404 检查
      if (to.matched.length === 0) {
        // 从登录页跳转且目标路径无效，回退首页（避免不同用户权限不同导致的 404）
        if (_from.path === "/login") {
          return { path: "/", replace: true };
        }
        return "/404";
      }

      // 动态标题
      const title = (to.params.title as string) || (to.query.title as string);
      if (title) {
        to.meta.title = title;
      }
    } catch (error) {
      console.error("Route guard error:", error);
      await useUserStore().resetAllState();
      NProgress.done();
      return "/login";
    }
  });

  router.afterEach((to, _from, failure) => {
    const duplicate = isNavigationFailure(failure, NavigationFailureType.duplicated);
    const token = to.query.__navToken ?? to.redirectedFrom?.query.__navToken;
    navigationMailbox.finish(
      to.fullPath,
      !failure || duplicate,
      typeof token === "string" ? token : undefined
    );
    NProgress.done();
  });
  router.onError((_error, to) => {
    const token = to.query.__navToken ?? to.redirectedFrom?.query.__navToken;
    if (typeof token === "string") navigationMailbox.cancel(token);
  });
}
