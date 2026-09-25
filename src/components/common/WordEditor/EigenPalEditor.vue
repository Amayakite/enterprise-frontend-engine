<template>
  <div class="eigenpal-host">
    <DocxEditor
      ref="editor"
      :document="document"
      :title="name"
      :fonts="fonts"
      :i18n="zhCN"
      :color-mode="settings.resolvedTheme === 'dark' ? 'dark' : 'light'"
      :menu="false"
      :navigation="false"
      locale="zh-CN"
      mode="edit"
      zoom-mode="auto"
      @ready="onReady"
      @change="onChange"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onErrorCaptured, shallowRef } from "vue";
import { DocxEditor } from "@docx-editor.dev/vue";
import type { DocxEditorRef } from "@docx-editor.dev/vue";
import type { DocumentChange } from "@docx-editor.dev/core/contracts/editor";
import { customFonts } from "@docx-editor.dev/core/editor";
import zhCN from "@docx-editor.dev/i18n/zh-CN";
import "@docx-editor.dev/vue/styles.css";
import { useSettingsStore } from "@/stores/settings";
import { documentFontSources, docxMime } from "@/config/document-assets";
import type { WordEditorProps, WordEditorEmits, WordEditorHandle } from "./types";

defineProps<WordEditorProps>();
const emit = defineEmits<WordEditorEmits>();
const settings = useSettingsStore();
/** 只访问官方 expose，编辑器组件自身负责销毁底层实例。 */
const editor = shallowRef<DocxEditorRef>();
const fonts = customFonts({ sources: documentFontSources });
let stopError: (() => void) | undefined;
let ready = false;

/** 导入完成后接上官方错误订阅，允许宿主操作文档。 */
function onReady() {
  ready = true;
  stopError?.();
  stopError = editor.value?.getEditor()?.on("error", (error) => emit("error", error.message));
  emit("ready");
}
/** 忽略导入通知，实际编辑才标记未导出。 */
function onChange(change: DocumentChange) {
  if (ready && !change.source) emit("change");
}
onErrorCaptured((error) => {
  emit("error", error.message);
  return false;
});
onBeforeUnmount(() => {
  ready = false;
  stopError?.();
});

/** 插入普通占位文本；保留上游对锁定区域和选区的校验。 */
function insertVariable(text: string) {
  if (!ready || !editor.value) throw new Error("编辑器尚未就绪");
  editor.value.focus();
  const result = editor.value.exec({ type: "insertText", text });
  if (!result.ok) throw new Error(result.reason);
}
/** 免费 Core 的 DOCX 保存接口；不加载 Pro 自动化或 PDF 模块。 */
async function exportDocx() {
  const bytes = await editor.value?.save();
  if (!bytes) throw new Error("文档尚未就绪，无法导出");
  return { blob: new Blob([bytes], { type: docxMime }), downloadStarted: false };
}
defineExpose<WordEditorHandle>({ insertVariable, exportDocx });
</script>

<style scoped>
.eigenpal-host {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
