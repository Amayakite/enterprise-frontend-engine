<template>
  <el-card header="附件预览实验">
    <p>选择本地文件直接预览，不上传、不保存；图片和文档使用同一预览器。</p>
    <input type="file" multiple aria-label="选择本地预览文件" @change="selectFiles" />
    <div class="preview-lab__files">
      <el-button
        v-for="(file, index) in files"
        :key="index"
        link
        type="primary"
        @click="open(index)"
      >
        {{ file.name }}
      </el-button>
    </div>
    <FilePreviewDialog v-model="visible" :files="files" :initial-index="initialIndex" />
  </el-card>
</template>
<script setup lang="ts">
import { ref, shallowRef } from "vue";
import FilePreviewDialog from "@/components/common/FilePreview/FilePreviewDialog.vue";
import type { FilePreviewItem } from "@/components/common/FilePreview/types";
/** 本地文件只保留于实验页面内存，不进入表单 DTO 或公共存储。 */
const files = shallowRef<FilePreviewItem[]>([]);
const visible = ref(false);
const initialIndex = ref(0);
/** 更换实验文件组时关闭旧预览。 */
function selectFiles(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  visible.value = false;
  files.value = Array.from(event.target.files ?? [], (file) => ({ name: file.name, blob: file }));
}
/** 从选中的文件开始，图片自动进入同组图片浏览。 */
function open(index: number) {
  initialIndex.value = index;
  visible.value = true;
}
</script>
<style scoped>
.preview-lab__files {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}
</style>
