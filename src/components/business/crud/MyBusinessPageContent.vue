<template>
  <component :is="editor.component" />
</template>
<script setup lang="ts">
import { provide } from "vue";
import { embeddedEditorKey } from "./presentation";
import type { PresentedEditor } from "./presentation";
const props = defineProps<{
  /** 本次打开的固定实例；父宿主按实例 key 重建此边界。 */
  editor: PresentedEditor;
  /** 保存成功后的来源刷新；省略不刷新，失败保留目标已保存状态。 */
  afterSave?: () => Promise<void>;
}>();
const editor = props.editor;
provide(embeddedEditorKey, {
  ...editor.context,
  saved: async (id) => {
    if (editor.context.presentation.current !== editor) return;
    await props.afterSave?.();
    await editor.context.saved(id);
  },
});
</script>
