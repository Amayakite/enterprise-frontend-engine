import { useAppStore, usePermissionStore, useSettingsStore } from "@/stores";
import { DeviceEnum } from "@/config/ui";

/** 左侧布局共用的响应式状态。 */
export function useLayout() {
  const appStore = useAppStore();
  const settingsStore = useSettingsStore();
  const permissionStore = usePermissionStore();

  return {
    isMobile: computed(() => appStore.device === DeviceEnum.MOBILE),
    isSidebarOpen: computed(() => appStore.sidebar.opened),
    showTagsView: computed(() => settingsStore.showTagsView),
    showLogo: computed(() => settingsStore.showAppLogo),
    routes: computed(() => permissionStore.routes),
    layoutClass: computed(() => ({
      "is-sidebar-collapsed": !appStore.sidebar.opened,
      "is-sidebar-open": appStore.sidebar.opened,
      "is-mobile": appStore.device === DeviceEnum.MOBILE,
      "layout--left": true,
    })),
    toggleSidebar: () => appStore.toggleSidebar(),
    closeSidebar: () => appStore.closeSidebar(),
  };
}
