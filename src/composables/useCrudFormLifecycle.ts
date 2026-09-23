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
  /** 所属弹窗/抽屉提供的关闭登记入口，嵌入表单优先使用它。 */
  const embedded = inject(embeddedEditorKey, undefined);
  /** 是否存在路由环境；普通独立表单无需登记路由守卫。 */
  const router = inject(routerKey, undefined);
  /** 当前表单离开检查的解除函数，卸载时由同一入口调用。 */
  let unregister = () => {};
  if (embedded) {
    unregister = embedded.register({
      canLeave: controller.canLeave,
      cancelLeaveApproval: controller.cancelLeaveApproval,
    });
  } else if (router) {
    /** 当前表单路由，用于登记固定实例的标签和路由离开检查。 */
    const route = useRoute();
    /** 创建时固定的页面地址，避免后台表单替其他标签登记离开保护。 */
    const fullPath = route.fullPath;
    /** 标签与缓存管理，关闭标签前也必须经过当前表单的离开检查。 */
    const tags = useTagsViewStore();
    unregister = tags.registerLeaveGuard(
      fullPath,
      controller.canLeave,
      controller.cancelLeaveApproval
    );
    /** 仍保留在缓存中的切页允许直接离开；真正移除表单前执行未保存检查。 */
    onBeforeRouteLeave(() =>
      route.meta.keepAlive && tags.cachedViews.includes(fullPath) ? true : controller.canLeave()
    );
    /** 同一路由组件改变目标地址时，先检查当前输入能否离开。 */
    onBeforeRouteUpdate((to, from) =>
      to.fullPath === from.fullPath ? true : controller.canLeave()
    );
  }
  /** 浏览器刷新或关闭时，若仍有修改或正在处理则请求原生离开提示。 */
  function beforeUnload(event: BeforeUnloadEvent) {
    if (controller.state.dirty || controller.busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  /** 挂载后登记浏览器关闭保护，不在服务端访问 window。 */
  onMounted(() => {
    if (typeof window !== "undefined") window.addEventListener("beforeunload", beforeUnload);
  });
  /** 卸载时同时移除容器/标签登记和浏览器事件监听。 */
  onBeforeUnmount(() => {
    unregister();
    if (typeof window !== "undefined") window.removeEventListener("beforeunload", beforeUnload);
  });
}
