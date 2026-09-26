<template>
  <!-- 安排页头、正文、侧栏和页脚的位置。通过 toolbar/default/aside/footer 插槽放内容；这里只管布局，不读取或保存数据。 -->
  <div
    class="crud-layout"
    :class="[
      layout && `crud-layout--${layout.preset}`,
      { 'crud-layout--embedded': layout && embedded },
    ]"
  >
    <div v-if="$slots.toolbar" class="crud-layout__toolbar"><slot name="toolbar" /></div>
    <div class="crud-layout__body" tabindex="0" role="region" aria-label="可滚动正文">
      <div class="crud-layout__main"><slot /></div>
      <aside v-if="$slots.aside" class="crud-layout__aside"><slot name="aside" /></aside>
    </div>
    <footer v-if="$slots.footer" class="crud-layout__footer"><slot name="footer" /></footer>
  </div>
</template>
<script setup lang="ts">
import { inject } from "vue";
import type { CrudLayoutOptions } from "./layout";
import { embeddedEditorKey } from "./presentation";
defineProps<{
  /** 内容布局；省略保持满高旧布局。simple 紧凑字段，structured 分区；两者铺满可用高度。
   * @example
   * `<MyCrudLayout :layout="{ preset: 'simple' }" />`
   */
  layout?: CrudLayoutOptions;
}>();
/** 读取弹窗/抽屉的嵌入标记，切换为容器内布局，避免再次套独立页面的间距和边框。 */
const embedded = inject(embeddedEditorKey, undefined);
defineSlots<{
  /** 固定顶部工具栏；省略不占空间。 */ toolbar?: () => unknown;
  /** 可滚动正文；加载时用 v-show 保留字段和子表登记。 */ default?: () => unknown;
  /** 可选侧栏，窄屏排列在正文之后。 */ aside?: () => unknown;
  /** 固定底部核对或操作区；省略不占空间。 */ footer?: () => unknown;
}>();
</script>
<style scoped lang="scss">
.crud-layout {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: var(--ui-panel-padding);
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
}
.crud-layout__toolbar,
.crud-layout__footer {
  flex-shrink: 0;
}
.crud-layout__body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* 为滚动条保留位置；内容增多时不挤动表单，明暗主题下都能发现滚动入口。 */
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: var(--el-text-color-placeholder) var(--el-fill-color-light);
  overscroll-behavior-y: contain;
  display: flex;
  gap: var(--ui-section-gap);
}
.crud-layout__body::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.crud-layout__body::-webkit-scrollbar-thumb {
  background: var(--el-text-color-placeholder);
  border: 2px solid var(--el-fill-color-light);
  border-radius: 6px;
}
.crud-layout__body::-webkit-scrollbar-track {
  background: var(--el-fill-color-light);
}
.crud-layout__body:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.crud-layout__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-section-gap);
}
.crud-layout__aside {
  flex: 0 0 260px;
}
/* 表单按实际内容撑开主列，由正文统一滚动；避免长附件列表溢出被压缩的 flex 主列。 */
.crud-layout--simple .crud-layout__main,
.crud-layout--structured .crud-layout__main {
  min-height: min-content;
}
.crud-layout__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-section-gap);
}
.crud-layout--simple,
.crud-layout--structured {
  padding: var(--ui-panel-padding);
  gap: 12px;
}
.crud-layout--simple .crud-layout__toolbar,
.crud-layout--structured .crud-layout__toolbar {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.crud-layout--simple .crud-layout__footer,
.crud-layout--structured .crud-layout__footer {
  display: block;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.crud-layout--embedded {
  max-width: none;
  border: 0;
  border-radius: 0;
  padding: 0;
}
@media (max-width: 767px) {
  .crud-layout--simple,
  .crud-layout--structured {
    padding: var(--ui-panel-padding);
    gap: 12px;
  }
  .crud-layout--embedded {
    padding: 0;
  }
}
@media (max-width: 767px) {
  .crud-layout__body {
    display: block;
  }
  .crud-layout__aside {
    margin-top: var(--ui-section-gap);
  }
}
</style>
