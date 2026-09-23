<template>
  <div
    class="crud-layout"
    :class="[
      layout && `crud-layout--${layout.preset}`,
      { 'crud-layout--embedded': layout && embedded },
    ]"
  >
    <div v-if="$slots.toolbar" class="crud-layout__toolbar"><slot name="toolbar" /></div>
    <div class="crud-layout__body">
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
const embedded = inject(embeddedEditorKey, undefined);
defineSlots<{
  /** 固定顶部工具栏；省略不占空间。 */ toolbar?: () => unknown;
  /** 可滚动正文；加载时用 v-show 保留字段和子表登记。 */ default?: () => unknown;
  /** 可选侧栏，窄屏排列在正文之后。 */ aside?: () => unknown;
  /** 固定底部核对或操作区；省略不占空间。 */ footer?: () => unknown;
}>();
</script>
<style scoped>
.crud-layout {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
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
  overscroll-behavior-y: contain;
  display: flex;
  gap: 16px;
}
.crud-layout__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.crud-layout__aside {
  flex: 0 0 260px;
}
.crud-layout__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}
.crud-layout--simple,
.crud-layout--structured {
  padding: 24px 28px;
  gap: 24px;
}
.crud-layout--simple .crud-layout__toolbar,
.crud-layout--structured .crud-layout__toolbar {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.crud-layout--simple .crud-layout__footer,
.crud-layout--structured .crud-layout__footer {
  display: block;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.crud-layout--embedded {
  max-width: none;
  border: 0;
  border-radius: 0;
  padding: 4px;
}
@media (max-width: 767px) {
  .crud-layout--simple,
  .crud-layout--structured {
    padding: 16px;
    gap: 16px;
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
    margin-top: 16px;
  }
}
</style>
