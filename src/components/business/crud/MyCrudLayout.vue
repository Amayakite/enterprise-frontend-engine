<template>
  <section class="crud-layout">
    <div v-if="$slots.toolbar" class="crud-layout__toolbar"><slot name="toolbar" /></div>
    <div class="crud-layout__body">
      <main class="crud-layout__main"><slot /></main>
      <aside v-if="$slots.aside" class="crud-layout__aside"><slot name="aside" /></aside>
    </div>
    <footer v-if="$slots.footer" class="crud-layout__footer"><slot name="footer" /></footer>
  </section>
</template>
<script setup lang="ts">
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
@media (max-width: 767px) {
  .crud-layout__body {
    display: block;
  }
  .crud-layout__aside {
    margin-top: 16px;
  }
}
</style>
