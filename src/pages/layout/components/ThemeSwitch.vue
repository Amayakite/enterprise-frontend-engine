<template>
  <el-popover trigger="click" placement="bottom-end" :width="264">
    <template #reference>
      <button class="appearance-trigger" type="button" aria-label="外观设置" title="外观设置">
        <el-icon :size="20">
          <component :is="settingsStore.resolvedTheme === ThemeMode.DARK ? Moon : Sunny" />
        </el-icon>
      </button>
    </template>

    <div class="appearance-panel">
      <div class="appearance-panel__header">外观设置</div>

      <div class="appearance-panel__section">
        <label class="appearance-panel__label" for="layout-density">界面密度</label>
        <el-select
          :teleported="false"
          size="default"
          id="layout-density"
          v-model="settingsStore.density"
          aria-label="界面密度"
          class="appearance-density"
        >
          <el-option
            v-for="item in layoutDensityOptions"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          />
        </el-select>
        <p class="appearance-density__hint">
          {{
            layoutDensityOptions.find((item) => item.value === settingsStore.density)?.description
          }}。应用于所有页面，自动保存。
        </p>
      </div>

      <div class="appearance-panel__section">
        <div class="appearance-panel__label">显示模式</div>
        <div class="appearance-modes">
          <button
            v-for="item in themeList"
            :key="item.value"
            type="button"
            :class="['appearance-mode', { 'is-active': settingsStore.theme === item.value }]"
            :aria-pressed="settingsStore.theme === item.value"
            @click="changeTheme(item.value, $event)"
          >
            <el-icon><component :is="item.component" /></el-icon>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>

      <div class="appearance-panel__section">
        <div class="appearance-panel__section-head">
          <span class="appearance-panel__label">主题色</span>
          <el-button
            link
            type="primary"
            :disabled="settingsStore.primaryColor === defaults.themeColors.primary"
            @click="changePrimaryColor(defaults.themeColors.primary, $event)"
          >
            恢复默认
          </el-button>
        </div>
        <div class="appearance-colors">
          <button
            v-for="item in themeColorPresets"
            :key="item.value"
            class="appearance-color"
            type="button"
            :title="item.label"
            :aria-label="`使用${item.label}主题色`"
            :aria-pressed="settingsStore.primaryColor === item.value"
            :style="{ '--swatch-color': item.value }"
            @click="changePrimaryColor(item.value, $event)"
          >
            <el-icon v-if="settingsStore.primaryColor === item.value"><Check /></el-icon>
          </button>
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { Check, Monitor, Moon, Sunny } from "@element-plus/icons-vue";
import { defaults, themeColorPresets } from "@/config/app";
import { layoutDensityOptions } from "@/config/density";
import { ThemeMode } from "@/config/ui";
import { useSettingsStore } from "@/stores";
import { startThemeModeTransition, startThemeTransition } from "@/utils/theme";

const settingsStore = useSettingsStore();

const themeList = [
  { label: "明亮", value: ThemeMode.LIGHT, component: Sunny },
  { label: "暗黑", value: ThemeMode.DARK, component: Moon },
  { label: "自动", value: ThemeMode.AUTO, component: Monitor },
] as const;

function transitionOrigin(event: MouseEvent) {
  return { x: event.clientX, y: event.clientY };
}

async function changeTheme(theme: ThemeMode, event: MouseEvent) {
  if (settingsStore.theme === theme) return;
  await startThemeModeTransition(transitionOrigin(event), async () => {
    settingsStore.theme = theme;
    await nextTick();
  });
}

function changePrimaryColor(color: string, event: MouseEvent) {
  if (settingsStore.primaryColor === color) return;
  startThemeTransition(transitionOrigin(event), settingsStore.resolvedTheme, color);
  settingsStore.primaryColor = color;
}
</script>

<style scoped lang="scss">
.appearance-density {
  width: 100%;
}
.appearance-density__hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.appearance-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 32px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }

  &:active {
    transform: scale(0.92);
  }
}

.appearance-panel {
  color: var(--el-text-color-primary);

  &__header {
    padding-bottom: 10px;
    font-size: 14px;
    font-weight: 600;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  &__section {
    padding-top: 14px;
  }

  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 24px;
  }

  &__label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.appearance-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.appearance-mode {
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;

  &:hover,
  &.is-active {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }

  &.is-active {
    background: var(--el-color-primary-light-9);
    transform: translateY(-1px);
  }
}

.appearance-colors {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
  margin-top: 8px;
}

.appearance-color {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background: var(--swatch-color);
  border: 2px solid var(--el-bg-color-overlay);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--el-border-color);
  transition:
    transform 0.16s,
    box-shadow 0.16s;

  &:hover {
    transform: translateY(-1px);
  }

  &[aria-pressed="true"] {
    box-shadow: 0 0 0 2px var(--swatch-color);
  }

  &:active {
    transform: scale(0.9);
  }
}
</style>
