import { inject, onBeforeUnmount, onMounted } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, routerKey, useRoute } from "vue-router";
import { embeddedEditorKey } from "@/components/business/crud/presentation";
import { useTagsViewStore } from "@/stores/tags-view";
import type { CrudFormController } from "@/components/business/crud/types";

/**
 * 表单控制器创建时登记一次离开保护；不依赖工具栏或字段组件的挂载。
 * @param controller 当前实例的原控制器；固定创建时路由，后台标签不跟随全局路由。
 * @remarks 无路由的独立表单只处理嵌入端口；卸载解除全部登记。
 */
export function useCrudFormLifecycle<M, E, I extends string | number>(
  controller: CrudFormController<M, E, I>
) {
  const embedded = inject(embeddedEditorKey, undefined);
  const router = inject(routerKey, undefined);
  let unregister = () => {};
  if (embedded) {
    unregister = embedded.register({
      canLeave: controller.canLeave,
      cancelLeaveApproval: controller.cancelLeaveApproval,
    });
  } else if (router) {
    const route = useRoute();
    const fullPath = route.fullPath;
    const tags = useTagsViewStore();
    unregister = tags.registerLeaveGuard(
      fullPath,
      controller.canLeave,
      controller.cancelLeaveApproval
    );
    onBeforeRouteLeave(() =>
      route.meta.keepAlive && tags.cachedViews.includes(fullPath) ? true : controller.canLeave()
    );
    onBeforeRouteUpdate((to, from) =>
      to.fullPath === from.fullPath ? true : controller.canLeave()
    );
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (controller.state.dirty || controller.busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  onMounted(() => {
    if (typeof window !== "undefined") window.addEventListener("beforeunload", beforeUnload);
  });
  onBeforeUnmount(() => {
    unregister();
    if (typeof window !== "undefined") window.removeEventListener("beforeunload", beforeUnload);
  });
}
