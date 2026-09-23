import {
  computed,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
} from "vue";
import { routerKey, routeLocationKey } from "vue-router";
import { navigationMailbox } from "@/router/navigation-intent";
import type { PageIntent } from "@/router/navigation-intent";
import { getBusinessTarget } from "@/router/business-targets";

/** 当前路由页一次性接收导航意图；只订阅本实例地址，不驱动实体加载。
 * @returns 意图、活动状态、结束引导和返回来源；无意图时不挂载视觉组件。
 * @example
 * `const intent = usePageIntent();`
 */
export function usePageIntent() {
  /** 当前路由信息，用于核对收到的跨页引导是否属于本页。 */
  const route = inject(routeLocationKey, undefined);
  /** 返回来源页使用的路由实例，独立挂载时可能未提供。 */
  const router = inject(routerKey, undefined);
  /** 创建时固定的页面地址，缓存页不会接收发给其他标签的导航信息。 */
  const identity = route?.fullPath;
  /** 本页面是否正在显示，后台页暂停接收引导。 */
  const active = ref(true);
  /** 最近为本页取出的一次性导航请求，包含目标操作与返回来源。 */
  const intent = shallowRef<PageIntent>();
  /** 是否显示新增入口引导，用户完成或关闭后设为 false。 */
  const guiding = ref(false);
  /** 返回来源失败的提示，不影响当前页面正常操作。 */
  const error = ref("");
  /** 只在本实例位于前台时领取导航信息，领取后根据操作类型决定是否引导新增。 */
  function receive() {
    if (!navigationMailbox.size) {
      intent.value = undefined;
      guiding.value = false;
      return;
    }
    if (!active.value || !identity || route?.fullPath !== identity) return;
    const next = navigationMailbox.take(identity);
    if (next) {
      intent.value = next;
      guiding.value = next.action === "create";
      error.value = "";
    }
  }
  /** 取消导航消息订阅的函数，组件卸载时执行。 */
  const release = navigationMailbox.subscribe(receive);
  /** 首次挂载时领取已经到达的跨页导航信息。 */
  onMounted(receive);
  /** 缓存页恢复时再次尝试领取发给本页的新信息。 */
  onActivated(() => {
    active.value = true;
    receive();
  });
  /** 页面隐藏后暂停接收并关闭当前引导，避免浮层留在其他页面上。 */
  onDeactivated(() => {
    active.value = false;
    guiding.value = false;
  });
  /** 卸载时解除消息订阅，避免继续持有本实例。 */
  onBeforeUnmount(release);
  return {
    intent,
    active,
    guiding,
    error,
    title: computed(() =>
      intent.value ? getBusinessTarget(intent.value.target)?.title : undefined
    ),
    finish: () => {
      guiding.value = false;
    },
    dismiss: () => {
      guiding.value = false;
      intent.value = undefined;
    },
    async back() {
      const source = intent.value?.source;
      if (!source || !router) return;
      try {
        const failure = await router.push(source.fullPath);
        if (failure) error.value = "页面未返回，请继续当前操作";
      } catch {
        error.value = "返回失败，请重试";
      }
    },
  };
}
