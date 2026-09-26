import { densityComponentSize, normalizeLayoutDensity } from "@/config/density";
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
  /** 与主题一样保存在本浏览器；切换不会重建页面或清除未保存表单。 */
  const legacySize = useStorage<string>(STORAGE_KEYS.SIZE, defaults.size);
  const savedDensity = useStorage<string>(
    STORAGE_KEYS.LAYOUT_DENSITY,
    legacySize.value === "small"
      ? "compact"
      : legacySize.value === "large"
        ? "comfortable"
        : "default"
  );
  const density = computed({
    get: () => normalizeLayoutDensity(savedDensity.value),
    set: (value) => {
      savedDensity.value = normalizeLayoutDensity(value);
    },
  });
  const componentSize = computed(() => densityComponentSize(density.value));
  watch(
    density,
    (value) => {
      document.documentElement.dataset.density = value;
    },
    { immediate: true }
  );
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
    density,
    componentSize,
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
