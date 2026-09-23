<template>
  <div>
    <button type="button" class="command-palette-trigger" aria-label="打开快捷搜索" @click="open">
      <span class="i-svg:search" aria-hidden="true" />
      <span>搜索菜单</span>
      <kbd>{{ modifier }} K</kbd>
    </button>
    <MyDialog
      v-model="visible"
      title="快捷搜索"
      width="min(640px, 94vw)"
      :show-footer="false"
      :show-fullscreen="false"
      :draggable="false"
      @opened="focusInput"
    >
      <div class="command-palette" @keydown="handleInputKeydown">
        <input
          ref="inputRef"
          v-model="keyword"
          class="command-palette-input"
          type="search"
          placeholder="搜索菜单"
          aria-label="搜索菜单"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="displayList.length ? `${listId}-${activeIndex}` : undefined"
        />
        <div class="command-palette-section">
          <span>{{ sectionLabel }} · {{ displayList.length }}</span>
          <button v-if="sectionLabel === '最近访问'" type="button" @click="clearHistory">
            清空历史
          </button>
        </div>
        <p v-if="!displayList.length" class="command-palette-empty" role="status">未找到匹配页面</p>
        <ul
          :id="listId"
          ref="list"
          role="listbox"
          :aria-label="sectionLabel"
          class="command-palette-list"
        >
          <li
            v-for="(item, index) in displayList"
            :id="`${listId}-${index}`"
            :key="item.path"
            role="option"
            :aria-selected="activeIndex === index"
            :aria-disabled="navigating"
            :class="{ 'is-active': activeIndex === index }"
            @mouseenter="activeIndex = index"
            @click="onGo(item)"
          >
            <span class="command-palette-title">
              <template v-for="(part, partIndex) in item.parts" :key="partIndex">
                <mark v-if="part.matched">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </span>
            <span class="command-palette-path">{{ item.path }}</span>
          </li>
        </ul>
        <p v-if="notice" class="command-palette-notice" role="status">{{ notice }}</p>
        <div class="command-palette-hints">
          <span>↑ ↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </MyDialog>
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref, useId, watch } from "vue";
import MyDialog from "@/components/common/MyDialog.vue";
import { useCommandPalette } from "./useCommandPalette";
const {
  visible,
  keyword,
  activeIndex,
  inputRef,
  displayList,
  sectionLabel,
  notice,
  navigating,
  open,
  close,
  focusInput,
  onSelect,
  onNavigate,
  onGo,
  clearHistory,
} = useCommandPalette();
const listId = `menu-search-${useId()}`;
const list = ref<HTMLElement>();
const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
watch(activeIndex, async (index) => {
  await nextTick();
  list.value?.children.item(index)?.scrollIntoView({ block: "nearest" });
});
function handleInputKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
  // Enter 只接管搜索输入；清空历史、关闭按钮保留自己的键盘行为。
  if (!(event.target instanceof HTMLInputElement)) return;
  if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") close();
    else if (event.key === "Enter") {
      if (!event.repeat) onSelect();
    } else onNavigate(event.key === "ArrowUp" ? "up" : "down");
  }
}
</script>
<style scoped>
.command-palette-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  cursor: pointer;
}
.command-palette-trigger kbd {
  margin-left: 12px;
  font: inherit;
}
.command-palette {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.command-palette-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--ui-control-radius);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font: inherit;
}
.command-palette-input:focus-visible {
  outline: var(--ui-focus-ring);
  outline-offset: 2px;
}
.command-palette-section {
  display: flex;
  justify-content: space-between;
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.command-palette-section button {
  border: 0;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}
.command-palette-list {
  max-height: 45vh;
  overflow: auto;
  list-style: none;
  margin: 0;
  padding: 2px;
}
.command-palette-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
}
.command-palette-list li:hover,
.command-palette-list li.is-active {
  background: var(--el-fill-color);
  outline: 1px solid var(--el-border-color);
}
.command-palette-title {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.command-palette-title mark {
  color: inherit;
  background: var(--el-color-primary-light-8);
  font-weight: 600;
}
.command-palette-path {
  color: var(--el-text-color-regular);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.command-palette-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--el-text-color-regular);
}
.command-palette-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.command-palette-notice {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
button:focus-visible {
  outline: var(--ui-focus-ring);
  outline-offset: 2px;
}
</style>
