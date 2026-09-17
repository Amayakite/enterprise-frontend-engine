<template>
  <el-upload
    ref="uploadRef"
    v-model:file-list="fileList"
    list-type="picture-card"
    :before-upload="uploader.beforeUpload"
    :http-request="uploader.upload"
    :on-success="handleSuccess"
    :on-error="handleError"
    :on-exceed="handleExceed"
    :accept="props.accept"
    :limit="props.limit"
    multiple
  >
    <span aria-label="上传图片">
      <el-icon><Plus /></el-icon>
    </span>
    <template #file="{ file }">
      <div class="image-upload__item">
        <img v-if="file.url" class="image-upload__image" :src="file.url" :alt="file.name" />
        <div v-if="file.status === 'success'" class="image-upload__actions">
          <el-button
            size="small"
            :aria-label="`预览图片 ${file.name}`"
            @click="handlePreviewImage(file)"
          >
            预览
          </el-button>
          <el-button
            size="small"
            type="danger"
            :aria-label="`删除图片 ${file.name}`"
            :loading="file.url ? deleting.has(file.url) : false"
            @click="handleRemove(file)"
          >
            删除
          </el-button>
        </div>
        <el-progress v-else class="image-upload__progress" :percentage="file.percentage ?? 0" />
      </div>
    </template>
  </el-upload>
  <el-image-viewer
    v-if="previewVisible"
    :zoom-rate="1.2"
    :initial-index="previewImageIndex"
    :url-list="modelValue"
    @close="handlePreviewClose"
  />
</template>
<script setup lang="ts">
import { genFileId } from "element-plus";
import type { UploadInstance, UploadUserFile } from "element-plus";
import FileAPI from "@/api/file";
import type { FileInfo } from "@/api/file";
import type { MultiImageUploadProps } from "./types";
import { useUpload } from "./useUpload";
const props = withDefaults(defineProps<MultiImageUploadProps>(), {
  data: () => ({}),
  name: "file",
  limit: 10,
  maxFileSize: 10,
  accept: "image/*",
});
/** 已成功上传的 URL 列表；默认空数组，外部替换会取消旧批次。 */
const modelValue = defineModel<string[]>({ default: () => [] });
const fileList = ref<UploadUserFile[]>([]);
const uploadRef = ref<UploadInstance>();
const previewVisible = ref(false);
const previewImageIndex = ref(0);
const deleting = reactive(new Set<string>());
let published: string[] | undefined;
let modelVersion = 0;
let alive = true;
const uploader = useUpload(
  () => props,
  (uid, percent) => {
    const item = fileList.value.find((file) => file.uid === uid);
    if (item) item.percentage = percent;
  }
);
function publish(urls: string[]) {
  published = [...urls];
  modelValue.value = urls;
}
watch(
  modelValue,
  (urls) => {
    if (
      published &&
      published.length === urls.length &&
      published.every((url, index) => url === urls[index])
    ) {
      published = undefined;
      return;
    }
    modelVersion++;
    uploader.reset();
    uploadRef.value?.abort();
    previewVisible.value = false;
    deleting.clear();
    fileList.value = urls.map((url) => ({
      name: url.substring(url.lastIndexOf("/") + 1),
      url,
      uid: genFileId(),
      status: "success",
    }));
  },
  { immediate: true, deep: true, flush: "sync" }
);
onBeforeUnmount(() => {
  alive = false;
  modelVersion++;
});
async function handleRemove(file: UploadUserFile) {
  const url = file.url;
  if (!url || deleting.has(url)) return;
  const version = modelVersion;
  deleting.add(url);
  try {
    await FileAPI.delete(url);
    if (!alive || version !== modelVersion) return;
    fileList.value = fileList.value.filter((item) => item.url !== url);
    previewVisible.value = false;
    publish(modelValue.value.filter((item) => item !== url));
  } catch {
    // 请求层提示错误，保留当前图片。
  } finally {
    if (version === modelVersion) deleting.delete(url);
  }
}
function handleExceed() {
  ElMessage.warning(`最多只能上传 ${props.limit} 张图片`);
}
function handleSuccess(info: FileInfo, uploaded: UploadUserFile) {
  const item = fileList.value.find((file) => file.uid === uploaded.uid);
  if (!alive || !item) return;
  item.url = info.url;
  item.status = "success";
  publish(
    fileList.value.flatMap((file) => (file.status === "success" && file.url ? [file.url] : []))
  );
  ElMessage.success("上传成功");
}
function handleError(_error: unknown) {
  // 请求层统一提示；主动取消不提示错误。
}
function handlePreviewImage(file: UploadUserFile) {
  const index = file.url ? modelValue.value.indexOf(file.url) : -1;
  if (index < 0) return;
  previewImageIndex.value = index;
  previewVisible.value = true;
}
function handlePreviewClose() {
  previewVisible.value = false;
}
</script>
<style scoped>
.image-upload__item {
  position: relative;
  width: 100%;
  height: 100%;
}
.image-upload__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.image-upload__actions {
  position: absolute;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 4px;
  background: var(--el-bg-color-overlay);
}
.image-upload__progress {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
}
</style>
