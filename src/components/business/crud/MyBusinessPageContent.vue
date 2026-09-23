<template>
  <component :is="editor.component" />
</template>
<script setup lang="ts">
import { provide } from "vue";
import { embeddedEditorKey } from "./presentation";
import type { PresentedEditor } from "./presentation";
const props = defineProps<{
  /** 本次要打开的页面信息；父组件在打开另一条记录时按 key 重新创建此组件。 */
  editor: PresentedEditor;
  /** 保存成功后的来源刷新；省略不刷新，失败保留目标已保存状态。 */
  afterSave?: () => Promise<void>;
}>();
/** 固定本次打开的页面对象；切换记录由父组件更换 key 重建，避免已有表单跟随其他记录变化。 */
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
