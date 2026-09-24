<template>
  <div class="file-preview">
    <OpenFileViewer
      :file="blob"
      :file-name="name"
      :plugins="plugins"
      :theme="theme"
      width="100%"
      height="100%"
      fit="width"
      locale="zh-CN"
      :toolbar="toolbar"
      @error="onError"
      @unsupported="onUnsupported"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { OpenFileViewer } from "@open-file-viewer/vue";
import { officePlugin, pdfPlugin, imagePlugin, textPlugin } from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useSettingsStore } from "@/stores/settings";
import { ThemeMode } from "@/config/ui";
import type { FilePreviewProps, FilePreviewEmits } from "./types";

defineProps<FilePreviewProps>();
const emit = defineEmits<FilePreviewEmits>();
/** 以应用已解析的主题为准，避免应用手动主题与操作系统不同步。 */
const settings = useSettingsStore();
const theme = computed(() => (settings.resolvedTheme === ThemeMode.DARK ? "dark" : "light"));
/** 首期只启用文档、图片、文本；PDF worker 随本地构建发布，不依赖外部 CDN。 */
const pdfAssets = `${import.meta.env.BASE_URL}vendor/file-preview/pdfjs/`;
const plugins = [
  officePlugin(),
  pdfPlugin({
    workerSrc,
    compatibilityMode: "modern",
    cMapUrl: `${pdfAssets}cmaps/`,
    standardFontDataUrl: `${pdfAssets}standard_fonts/`,
    wasmUrl: `${pdfAssets}wasm/`,
  }),
  imagePlugin(),
  textPlugin(),
];
/** 下载和全屏由外层统一提供，避免出现两套操作入口。 */
const toolbar = {
  zoom: true,
  search: true,
  rotate: true,
  download: false,
  fullscreen: false,
  print: false,
};
/** 把解析错误交给容器，仍允许用户下载原文件。 */
function onError(error: Error) {
  emit("error", `文件解析失败：${error.message}`);
}
/** 未注册的格式显示明确回退提示，不宣称所有扩展名都可预览。 */
function onUnsupported() {
  emit("error", "暂不支持此文件格式的在线预览，请下载后查看。");
}
</script>

<style scoped>
.file-preview {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
