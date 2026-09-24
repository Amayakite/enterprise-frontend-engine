<template>
  <div class="file-attachment" :class="`file-attachment--${appearance.kind}`">
    <button
      class="file-attachment__main"
      type="button"
      :disabled="pending"
      :aria-label="`预览文件 ${name}`"
      :title="name"
      @click="emit('preview')"
    >
      <span class="file-attachment__icon" aria-hidden="true">
        <component :is="icons[appearance.kind]" />
      </span>
      <span class="file-attachment__text">
        <span class="file-attachment__name">{{ name }}</span>
        <span class="file-attachment__meta">
          {{ appearance.label }}
          <span v-if="appearance.extension">· {{ appearance.extension }}</span>
          <span v-if="pending">· 上传中</span>
        </span>
      </span>
    </button>
    <div v-if="!pending" class="file-attachment__actions">
      <el-button link :icon="Download" :aria-label="`下载文件 ${name}`" @click="emit('download')">
        下载
      </el-button>
      <el-button
        v-if="removable"
        link
        type="danger"
        :icon="Delete"
        :loading="removing"
        :aria-label="`删除文件 ${name}`"
        @click="emit('remove')"
      />
    </div>
    <el-progress
      v-else
      class="file-attachment__progress"
      :percentage="progress"
      :stroke-width="3"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Document,
  Tickets,
  Grid,
  DataAnalysis,
  Picture,
  Folder,
  VideoPlay,
  Headset,
  More,
  Download,
  Delete,
} from "@element-plus/icons-vue";
import { getFileAppearance } from "./file-appearance";
import type { FileAttachmentProps, FileAttachmentEmits } from "./types";

const props = withDefaults(defineProps<FileAttachmentProps>(), {
  pending: false,
  progress: 0,
  removable: false,
  removing: false,
});
const emit = defineEmits<FileAttachmentEmits>();
/** 图标只用于识别文件类别，不表示当前格式一定支持在线预览。 */
const icons = {
  word: Document,
  sheet: Grid,
  slides: DataAnalysis,
  pdf: Tickets,
  image: Picture,
  archive: Folder,
  video: VideoPlay,
  audio: Headset,
  text: Document,
  other: More,
};
/** 根据原文件名生成类型提示；不读取内容，不发额外预览请求。 */
const appearance = computed(() => getFileAppearance(props.name));
</script>

<style scoped>
.file-attachment {
  --file-accent: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
.file-attachment:hover,
.file-attachment:focus-within {
  border-color: var(--el-border-color-dark);
  background: var(--el-fill-color-light);
}
.file-attachment--word {
  --file-accent: #397bda;
}
.file-attachment--sheet {
  --file-accent: #239c70;
}
.file-attachment--slides {
  --file-accent: #dc8534;
}
.file-attachment--pdf {
  --file-accent: #dc5e61;
}
.file-attachment--image {
  --file-accent: #9470d5;
}
.file-attachment--archive {
  --file-accent: #b39042;
}
.file-attachment--video,
.file-attachment--audio {
  --file-accent: #299ba8;
}
.file-attachment__main {
  display: flex;
  align-items: center;
  flex: 1 1 150px;
  gap: 12px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-text-color-primary);
  text-align: left;
  font: inherit;
  cursor: pointer;
  border-radius: 4px;
}
.file-attachment__main:disabled {
  cursor: default;
}
.file-attachment__main:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 4px;
}
.file-attachment__icon {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  height: 44px;
  border-radius: 6px;
  color: var(--file-accent);
  background: color-mix(in srgb, var(--file-accent) 12%, transparent);
}
.file-attachment__icon svg {
  width: 24px;
  height: 24px;
}
.file-attachment__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.file-attachment__name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.file-attachment__meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.file-attachment__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.file-attachment__progress {
  flex: 1 0 100%;
}
</style>
