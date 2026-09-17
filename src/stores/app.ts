import zhCn from "element-plus/es/locale/lang/zh-cn";
import { store } from "@/stores";
import { DeviceEnum, SidebarStatus } from "@/config/ui";
import { STORAGE_KEYS } from "@/config/constants";
import { defaults } from "@/config/app";

export const useAppStore = defineStore("app", () => {
  /**
   * 当前设备类型
   */
  const device = useStorage(STORAGE_KEYS.DEVICE, DeviceEnum.DESKTOP);

  /**
   * 组件默认尺寸
   */
  const size = useStorage(STORAGE_KEYS.SIZE, defaults.size);

  /**
   * 侧边栏持久化状态
   */
  const sidebarStatus = useStorage(STORAGE_KEYS.SIDEBAR_STATUS, SidebarStatus.CLOSED);

  /**
   * 侧边栏显示状态
   */
  const sidebar = reactive({
    opened: sidebarStatus.value === SidebarStatus.OPENED,
    withoutAnimation: false,
  });

  /**
   * 内容区是否全屏
   */
  const contentFullscreen = ref(false);

  /**
   * Element Plus 当前语言包
   */
  const locale = zhCn;

  /**
   * 切换侧边栏展开状态
   */
  function toggleSidebar() {
    sidebar.opened = !sidebar.opened;
    sidebarStatus.value = sidebar.opened ? SidebarStatus.OPENED : SidebarStatus.CLOSED;
  }

  /**
   * 关闭侧边栏
   */
  function closeSidebar() {
    sidebar.opened = false;
    sidebarStatus.value = SidebarStatus.CLOSED;
  }

  /**
   * 打开侧边栏
   */
  function openSidebar() {
    sidebar.opened = true;
    sidebarStatus.value = SidebarStatus.OPENED;
  }

  /**
   * 切换设备类型
   */
  function toggleDevice(val: string) {
    device.value = val;
  }

  /**
   * 切换组件尺寸
   */
  function changeSize(val: string) {
    size.value = val;
  }

  /**
   * 切换内容区全屏状态
   */
  function toggleContentFullscreen() {
    contentFullscreen.value = !contentFullscreen.value;
  }

  return {
    device,
    sidebar,
    locale,
    size,
    contentFullscreen,
    toggleDevice,
    changeSize,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    toggleContentFullscreen,
  };
});

export function useAppStoreHook() {
  return useAppStore(store);
}
