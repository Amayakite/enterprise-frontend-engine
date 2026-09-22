import { useBusinessOpen } from "./useBusinessOpen";
import { inject, nextTick, onActivated, onBeforeUnmount, ref } from "vue";
import {
  routerKey,
  routeLocationKey,
  isNavigationFailure,
  NavigationFailureType,
} from "vue-router";
import { getBusinessTarget } from "@/router/business-targets";
import type { BusinessNavigationRequest } from "@/router/business-targets";
import type { NavigationSource } from "@/router/navigation-intent";
import { navigationMailbox, stripNavigationQuery } from "@/router/navigation-intent";

/** 发起参照导航；不创建单据、不检查菜单来隐藏入口。
 * @param focus 返回来源后可选的公开聚焦方法。
 * @returns open、busy、error；失败留在来源，错误由局部 UI 呈现。
 * @example
 * `const navigation = useBusinessNavigation(() => reference.focus());`
 */
export function useBusinessNavigation(focus?: () => void) {
  const router = inject(routerKey, undefined);
  const route = inject(routeLocationKey, undefined);
  const { openBusiness } = useBusinessOpen();
  const busy = ref(false);
  const error = ref("");
  let alive = true;
  let returning = false;
  onBeforeUnmount(() => {
    alive = false;
  });
  onActivated(async () => {
    if (returning) {
      returning = false;
      await nextTick();
      if (alive) focus?.();
    }
  });
  async function open(request: BusinessNavigationRequest, saved?: (id: string) => Promise<void>) {
    if (busy.value) return false;
    if (!router || !route) {
      error.value = "当前宿主没有配置页面导航";
      return false;
    }
    const target = getBusinessTarget(request.target);
    if (!target) {
      error.value = "目标页面未配置";
      return false;
    }
    const action = request.action ?? "view";
    if (action === "create" && !target.add) {
      error.value = "目标页面不支持新增";
      return false;
    }
    if (action === "create" || request.id !== undefined) {
      busy.value = true;
      error.value = "";
      try {
        const opened = await openBusiness({
          target: target.key,
          view: action === "create" ? "add" : "detail",
          id: request.id,
          mode: request.mode,
          completion: "return-to-source",
          onSaved: async (id) => {
            if (alive) {
              await saved?.(id);
              await nextTick();
              focus?.();
            }
          },
        });
        if (!opened) error.value = "页面未打开，请继续当前操作";
        returning = opened;
        return opened;
      } catch (cause) {
        if (alive) error.value = cause instanceof Error ? cause.message : "页面打开失败，请重试";
        return false;
      } finally {
        busy.value = false;
      }
    }
    const path =
      action === "view" && request.id !== undefined && target.detail
        ? target.detail(request.id)
        : target.list;
    const token = crypto.randomUUID();
    const source: NavigationSource = {
      fullPath: router.resolve({
        path: route.path,
        query: stripNavigationQuery(route.query),
        hash: route.hash,
      }).fullPath,
      title: typeof route.meta.title === "string" ? route.meta.title : "来源页面",
    };
    navigationMailbox.source(token, source);
    busy.value = true;
    error.value = "";
    try {
      const failure = await router.push({
        path,
        query: { __navTarget: target.key, __navAction: action, __navToken: token },
      });
      if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
        navigationMailbox.cancel(token);
        error.value = "页面未跳转，请继续当前操作";
        return false;
      }
      returning = true;
      return true;
    } catch (cause) {
      navigationMailbox.cancel(token);
      if (alive) error.value = cause instanceof Error ? cause.message : "页面打开失败，请重试";
      return false;
    } finally {
      busy.value = false;
    }
  }
  return { open, busy, error };
}
