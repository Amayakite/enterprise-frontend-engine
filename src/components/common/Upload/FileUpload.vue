<!-- 文件上传组件：成功结果逐个回传，进行中的文件保持独立。 -->
<template>
  <div class="file-upload" :style="props.style">
    <el-upload
      ref="uploadRef"
      v-model:file-list="fileList"
      :before-upload="uploader.beforeUpload"
      :http-request="uploader.upload"
      :on-success="handleSuccess"
      :on-error="handleError"
      :on-exceed="handleExceed"
      :accept="props.accept"
      :limit="props.limit"
      multiple
    >
      <el-button type="primary" :disabled="fileList.length >= props.limit">
        {{ props.uploadBtnText }}
      </el-button>
      <template #file="{ file }">
        <div class="file-upload__item">
          <template v-if="file.status === 'success'">
            <el-button link class="file-upload__name" @click="handleDownload(file)">
              <el-icon><Document /></el-icon>
              <span>{{ file.name }}</span>
            </el-button>
            <el-button
              link
              type="danger"
              :aria-label="`删除文件 ${file.name}`"
              :loading="file.url ? deleting.has(file.url) : false"
              @click="handleRemove(file)"
            >
              删除
            </el-button>
          </template>
          <template v-else>
            <span class="file-upload__name">{{ file.name }}</span>
            <el-progress class="file-upload__progress" :percentage="file.percentage ?? 0" />
          </template>
        </div>
      </template>
    </el-upload>
  </div>
</template>
<script setup lang="ts">
import { genFileId } from "element-plus";
import type { UploadFile, UploadInstance, UploadUserFile } from "element-plus";
import FileAPI from "@/api/file";
import type { FileInfo } from "@/api/file";
import type { FileUploadProps } from "./types";
import { useUpload } from "./useUpload";

const props = withDefaults(defineProps<FileUploadProps>(), {
  data: () => ({}),
  name: "file",
  limit: 10,
  maxFileSize: 10,
  accept: "*",
  uploadBtnText: "上传文件",
  style: () => ({ width: "300px" }),
});
/** 成功文件列表；父页面替换模型会取消进行中的上传，默认空数组。 */
const modelValue = defineModel<FileInfo[]>({ default: () => [] });
const fileList = ref<UploadUserFile[]>([]);
const uploadRef = ref<UploadInstance>();
const deleting = reactive(new Set<string>());
let published: FileInfo[] | undefined;
let modelVersion = 0;
let alive = true;
const uploader = useUpload(
  () => props,
  (uid, percent) => {
    const item = fileList.value.find((file) => file.uid === uid);
    if (item) item.percentage = percent;
  }
);
function publish(files: FileInfo[]) {
  published = files;
  modelValue.value = files;
}
watch(
  modelValue,
  (files) => {
    if (
      published &&
      files.length === published.length &&
      files.every(
        (file, index) =>
          file.name === published?.[index].name && file.url === published?.[index].url
      )
    ) {
      published = undefined;
      return;
    }
    modelVersion++;
    uploader.reset();
    uploadRef.value?.abort();
    deleting.clear();
    fileList.value = files.map((file) => ({ ...file, uid: genFileId(), status: "success" }));
  },
  { immediate: true, deep: true, flush: "sync" }
);
onBeforeUnmount(() => {
  alive = false;
  modelVersion++;
});
function handleSuccess(info: FileInfo, file: UploadFile) {
  const item = fileList.value.find((entry) => entry.uid === file.uid);
  if (!alive || !item) return;
  item.url = info.url;
  item.name = info.name;
  item.status = "success";
  publish(
    fileList.value.flatMap((entry) =>
      entry.status === "success" && entry.url ? [{ name: entry.name, url: entry.url }] : []
    )
  );
  ElMessage.success("上传成功");
}
function handleError(_error: unknown) {
  // FileAPI 请求层已提示错误；取消、卸载不重复提示。
}
function handleExceed() {
  ElMessage.warning(`最多只能上传 ${props.limit} 个文件`);
}
async function handleRemove(file: UploadUserFile) {
  const url = file.url;
  if (!url || deleting.has(url)) return;
  const version = modelVersion;
  deleting.add(url);
  try {
    await FileAPI.delete(url);
    if (!alive || version !== modelVersion) return;
    fileList.value = fileList.value.filter((entry) => entry.url !== url);
    publish(modelValue.value.filter((entry) => entry.url !== url));
  } catch {
    // 请求层提示失败；保留附件。
  } finally {
    if (version === modelVersion) deleting.delete(url);
  }
}
async function handleDownload(file: UploadUserFile) {
  if (!file.url) return;
  try {
    await FileAPI.download(file.url, file.name);
  } catch {
    // 请求层或下载工具已提示，保留文件列表供重试。
  }
}
</script>
<style scoped>
.file-upload {
  max-width: 100%;
}
.file-upload__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.file-upload__name {
  min-width: 0;
  flex: 1;
  justify-content: flex-start;
  white-space: normal;
  overflow-wrap: anywhere;
}
.file-upload__progress {
  width: 100px;
  flex-shrink: 0;
}
</style>
