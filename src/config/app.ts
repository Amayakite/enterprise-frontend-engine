import { ComponentSize, SidebarColor, ThemeMode, TagsViewStyle } from "@/config/ui";

const { pkg } = __APP_INFO__;
export const themeColorNames = ["primary", "success", "warning", "danger", "info"] as const;
export type ThemeColorName = (typeof themeColorNames)[number];
export type ThemeColorMap = Record<ThemeColorName, string>;

export const themeColorPresets = [
  { label: "海蔚蓝", value: "#165DFF" },
  { label: "靛青", value: "#4F46E5" },
  { label: "紫罗兰", value: "#722ED1" },
  { label: "青碧", value: "#007D83" },
  { label: "松绿", value: "#087F5B" },
  { label: "玫红", value: "#C2185B" },
] as const;

export const appConfig = {
  name: pkg.name,
  version: pkg.version,
  title: import.meta.env.VITE_APP_TITLE || pkg.name,
} as const;

/** 界面配置集中在这里；运行时只开放主色，功能色保持稳定的业务语义。 */
export const defaults = {
  theme: ThemeMode.AUTO,
  themeColors: {
    primary: "#165DFF",
    success: "#00B42A",
    warning: "#FF7D00",
    danger: "#F53F3F",
    info: "#86909C",
  } satisfies ThemeColorMap,
  sidebarColorScheme: SidebarColor.MINIMAL_WHITE,
  size: ComponentSize.DEFAULT,
  showTagsView: true,
  tagsViewStyle: TagsViewStyle.CARD,
  showAppLogo: true,
  showWatermark: false,
  pageSwitchingAnimation: "fade-slide",
} as const;
