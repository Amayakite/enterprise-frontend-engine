<template>
  <MyDialog
    v-model="visible"
    :title="current?.name || '文件预览'"
    width="1100px"
    fill-height
    body-scroll="content"
    :show-footer="false"
  >
    <div class="file-preview-dialog">
      <div class="file-preview-dialog__actions">
        <el-button :disabled="index <= 0" @click="index--">上一个附件</el-button>
        <span>{{ index + 1 }} / {{ files.length }}</span>
        <el-button :disabled="index >= files.length - 1" @click="index++">下一个附件</el-button>
        <el-button :disabled="!current" :loading="downloading" @click="download">
          下载原文件
        </el-button>
      </div>
      <div v-if="loading" class="file-preview-dialog__state" role="status">正在读取文件…</div>
      <div v-else-if="error" class="file-preview-dialog__state" role="alert">
        <p>{{ error }}</p>
        <el-button @click="reload">重试预览</el-button>
      </div>
      <FilePreview
        v-else-if="content && current"
        :key="generation"
        :blob="content"
        :name="current.name"
        class="file-preview-dialog__viewer"
        @error="showError"
      />
    </div>
  </MyDialog>
</template>

<script setup lang="ts">
import { feedback } from "@/utils/feedback";
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowRef,
  watch,
} from "vue";
import MyDialog from "@/components/common/MyDialog.vue";
import FileAPI from "@/api/file";
import { downloadFile } from "@/utils/download";
import type { FilePreviewDialogProps, FilePreviewItem } from "./types";

const props = withDefaults(defineProps<FilePreviewDialogProps>(), { initialIndex: 0 });
/** 是否打开；关闭和页面失活时释放文件内容并取消读取，不改变附件模型。 */
const visible = defineModel<boolean>({ default: false });
/** 只在真正打开附件时下载渲染模块；失败可通过重试重新加载。 */
const FilePreview = defineAsyncComponent({
  loader: () => import("./FilePreview.vue"),
  onError(_error, _retry, fail) {
    showError("预览组件加载失败，请重试。");
    fail();
  },
});
/** 当前附件索引，由首次打开及上下一个操作更新。 */
const index = ref(0);
const current = computed(() => props.files[index.value]);
/** 读取状态和解析错误仅属于本次打开的附件。 */
const loading = ref(false);
const error = ref("");
const content = shallowRef<Blob>();
const downloading = ref(false);
/** 请求代次拒绝迟到结果；不监听全局路由，失活时关闭当前页面自己的预览。 */
let generation = 0;
let controller: AbortController | undefined;

/** 清理当前预览拥有的资源，同时让旧请求结果失效。 */
function release() {
  generation++;
  controller?.abort();
  content.value = undefined;
  loading.value = false;
}
/** 本地 Blob 直接使用；远程地址交给文件 API 决定认证方式。 */
async function read(file: FilePreviewItem, signal: AbortSignal): Promise<Blob> {
  if (file.blob) return file.blob;
  if (!file.url) throw new Error("文件地址不存在");
  return (await FileAPI.read(file.url, signal)).data;
}
/** 读取当前附件；图片与文档统一交给 open-file-viewer 渲染。 */
async function reload() {
  release();
  error.value = "";
  if (!visible.value) return;
  const file = current.value;
  if (!file) {
    error.value = "文件不存在，请关闭后重新选择。";
    return;
  }
  controller = new AbortController();
  const signal = controller.signal;
  const version = generation;
  loading.value = true;
  try {
    const blob = await read(file, signal);
    if (version !== generation) return;
    content.value = blob;
  } catch (cause) {
    if (version === generation)
      error.value = cause instanceof Error ? cause.message : "文件读取失败，请重试。";
  } finally {
    if (version === generation) loading.value = false;
  }
}
/** 下载保留原始字节；预览解析失败也可使用已读取的内容下载。 */
async function download() {
  const file = current.value;
  if (!file) return;
  downloading.value = true;
  try {
    if (content.value || file.blob) {
      const blob = content.value ?? file.blob;
      if (blob) downloadFile({ data: blob, headers: {} }, file.name);
    } else if (file.url) await FileAPI.download(file.url, file.name);
  } catch {
    feedback.error("文件下载失败，请重试。");
  } finally {
    downloading.value = false;
  }
}
/** 解析失败保留下载入口，不自动上传或调用外部转换服务。 */
function showError(message: string) {
  error.value = message;
}
/** 附件变更及 KeepAlive 失活时关闭预览。 */
function close() {
  visible.value = false;
  release();
}
// 打开时定位选中附件；同一次打开内切换索引仅加载选中的文件。
watch(
  () => [visible.value, props.initialIndex] as const,
  () => {
    index.value = props.initialIndex;
  },
  { immediate: true, flush: "sync" }
);
watch(
  [visible, index],
  () => {
    void reload();
  },
  { immediate: true }
);
watch(
  () => props.files,
  () => {
    if (visible.value) close();
  },
  { deep: true }
);
onDeactivated(close);
onBeforeUnmount(release);
</script>

<style scoped>
.file-preview-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.file-preview-dialog__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.file-preview-dialog__viewer {
  flex: 1;
  min-height: 0;
}
.file-preview-dialog__state {
  padding: 32px 12px;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
