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
 * @returns open、busy、error；失败留在来源，错误由局部 UI 显示。
 * @example
 * `const navigation = useBusinessNavigation(() => reference.focus());`
 */
export function useBusinessNavigation(focus?: () => void) {
  /** 用于打开目标列表和返回来源的路由实例，独立使用时可能未提供。 */
  const router = inject(routerKey, undefined);
  /** 发起跳转时的来源页面信息，临时导航参数会先清理。 */
  const route = inject(routeLocationKey, undefined);
  /** 复用新增/详情的统一展示策略，不在参照控件中另写容器逻辑。 */
  const { openBusiness } = useBusinessOpen();
  /** 一次导航是否进行中，防止重复点击参照导航。 */
  const busy = ref(false);
  /** 导航失败原因，保留在来源控件旁供用户重试。 */
  const error = ref("");
  /** 来源控件是否仍存在，目标保存后只向存活控件回写。 */
  let alive = true;
  /** 曾成功打开目标页；来源缓存页下次激活时恢复参照焦点。 */
  let returning = false;
  /** 来源卸载后禁用回写和焦点恢复。 */
  onBeforeUnmount(() => {
    alive = false;
  });
  /** 从目标页返回缓存来源时，等待 DOM 更新后恢复参照控件焦点。 */
  onActivated(async () => {
    if (returning) {
      returning = false;
      await nextTick();
      if (alive) focus?.();
    }
  });
  /** 新增或指定 ID 时按统一方式打开目标；否则跳列表并传递一次性引导信息。 */
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
