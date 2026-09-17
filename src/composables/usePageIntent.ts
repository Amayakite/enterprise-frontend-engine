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
  const route = inject(routeLocationKey, undefined);
  const router = inject(routerKey, undefined);
  const identity = route?.fullPath;
  const active = ref(true);
  const intent = shallowRef<PageIntent>();
  const guiding = ref(false);
  const error = ref("");
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
  const release = navigationMailbox.subscribe(receive);
  onMounted(receive);
  onActivated(() => {
    active.value = true;
    receive();
  });
  onDeactivated(() => {
    active.value = false;
    guiding.value = false;
  });
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
