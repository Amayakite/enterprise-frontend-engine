import { SidebarColor, TagsViewStyle, ThemeMode } from "@/config/ui";
import { defaults } from "@/config/app";
import { STORAGE_KEYS } from "@/config/constants";
import {
  applyTheme,
  generateThemeColors,
  resolveThemeMode,
  toggleDarkMode,
  toggleSidebarColor,
  watchSystemTheme,
} from "@/utils/theme";

export const useSettingsStore = defineStore("setting", () => {
  const theme = useStorage<ThemeMode>(STORAGE_KEYS.THEME, defaults.theme);
  const primaryColor = useStorage<string>(STORAGE_KEYS.THEME_PRIMARY, defaults.themeColors.primary);
  const resolvedTheme = ref<ThemeMode>(resolveThemeMode(theme.value));
  let stopWatchingSystemTheme: (() => void) | undefined;

  watch(
    theme,
    (value) => {
      stopWatchingSystemTheme?.();
      resolvedTheme.value = resolveThemeMode(value);
      stopWatchingSystemTheme =
        value === ThemeMode.AUTO
          ? watchSystemTheme((systemTheme) => {
              resolvedTheme.value = systemTheme;
            })
          : undefined;
    },
    { immediate: true }
  );

  watch(
    [resolvedTheme, primaryColor],
    ([value, primary]) => {
      toggleDarkMode(value === ThemeMode.DARK);
      applyTheme(generateThemeColors({ ...defaults.themeColors, primary }, value));
    },
    { immediate: true }
  );

  toggleSidebarColor((defaults.sidebarColorScheme as SidebarColor) === SidebarColor.CLASSIC_BLUE);
  onScopeDispose(() => stopWatchingSystemTheme?.());

  return {
    theme,
    primaryColor,
    resolvedTheme,
    showTagsView: defaults.showTagsView,
    tagsViewStyle: defaults.tagsViewStyle as TagsViewStyle,
    showAppLogo: defaults.showAppLogo,
    showWatermark: defaults.showWatermark,
    sidebarColorScheme: defaults.sidebarColorScheme as SidebarColor,
    pageSwitchingAnimation: defaults.pageSwitchingAnimation,
  };
});
