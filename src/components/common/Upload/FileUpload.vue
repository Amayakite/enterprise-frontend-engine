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
      :show-file-list="false"
      multiple
    >
      <el-button type="primary" :disabled="fileList.length >= props.limit">
        {{ props.uploadBtnText }}
      </el-button>
      <template #tip>
        <div class="file-upload__hint">
          最多 {{ props.limit }} 个文件，单个不超过 {{ props.maxFileSize }} MB · 点击文件名预览
        </div>
      </template>
    </el-upload>
    <ul v-if="fileList.length" class="file-upload__list" aria-label="已选附件">
      <li v-for="file in fileList" :key="file.uid">
        <FileAttachment
          :name="file.name"
          :pending="file.status !== 'success'"
          :progress="file.percentage ?? 0"
          removable
          :removing="file.url ? deleting.has(file.url) : false"
          @preview="handlePreview(file)"
          @download="handleDownload(file)"
          @remove="handleRemove(file)"
        />
      </li>
    </ul>
    <FilePreviewDialog v-model="previewVisible" :files="modelValue" :initial-index="previewIndex" />
  </div>
</template>
<script setup lang="ts">
import { feedback } from "@/utils/feedback";
import FileAttachment from "@/components/common/FilePreview/FileAttachment.vue";
import { genFileId } from "element-plus";
import type { UploadFile, UploadInstance, UploadUserFile } from "element-plus";
import FileAPI from "@/api/file";
import type { FileInfo } from "@/api/file";
import type { FileUploadProps } from "./types";
import { useUpload } from "./useUpload";
import FilePreviewDialog from "@/components/common/FilePreview/FilePreviewDialog.vue";

const props = withDefaults(defineProps<FileUploadProps>(), {
  data: () => ({}),
  name: "file",
  limit: 10,
  maxFileSize: 10,
  accept: "*",
  uploadBtnText: "上传文件",
  style: () => ({ width: "100%" }),
});
/** 成功文件列表；父页面替换模型会取消进行中的上传，默认空数组。 */
const modelValue = defineModel<FileInfo[]>({ default: () => [] });
/** 上传控件中的本地文件项，包含进度和状态；对外模型只保存成功上传的文件信息。 */
const fileList = ref<UploadUserFile[]>([]);
/** 当前附件组的预览位置；文件名打开预览，下载使用独立按钮。 */
const previewVisible = ref(false);
const previewIndex = ref(0);
/** 只预览已成功上传、仍存在于模型中的文件。 */
function handlePreview(file: UploadUserFile) {
  const index = modelValue.value.findIndex((item) => item.url === file.url);
  if (index < 0) return;
  previewIndex.value = index;
  previewVisible.value = true;
}
/** 上传组件公开实例，外部整体替换文件列表时用它取消旧上传。 */
const uploadRef = ref<UploadInstance>();
/** 正在删除的文件 URL 集合，防止同一文件重复发起删除请求。 */
const deleting = reactive(new Set<string>());
/** 记住本组件刚发布的文件列表，识别父级 v-model 回传，避免重置仍在上传的其他项。 */
let published: FileInfo[] | undefined;
/** 外部替换列表时递增，旧删除请求返回后不能修改新列表。 */
let modelVersion = 0;
/** 组件是否仍存在，异步上传或删除返回后先检查再修改界面。 */
let alive = true;
/** 复用公共格式检查、上传和取消逻辑，并按文件 uid 更新进度。 */
const uploader = useUpload(
  () => props,
  (uid, percent) => {
    const item = fileList.value.find((file) => file.uid === uid);
    if (item) item.percentage = percent;
  }
);
/** 把成功文件列表回写父页面，同时记录此次回传值以免触发无效重置。 */
function publish(files: FileInfo[]) {
  published = files;
  modelValue.value = files;
}
/** 外部整体替换模型时取消旧上传并重建列表；自身发布的值回传时保留当前上传状态。 */
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
/** 使正在执行的删除等异步结果失效，避免卸载后回写父页面。 */
onBeforeUnmount(() => {
  alive = false;
  modelVersion++;
});
/** 只接收仍在列表中的上传项，更新地址和状态后发布全部成功文件。 */
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
  feedback.success("上传成功");
}
/** 上传错误已由公共请求处理；此处不重复弹出消息，主动取消也保持安静。 */
function handleError(_error: unknown) {
  // FileAPI 请求层已提示错误；取消、卸载不重复提示。
}
/** 选择数量超过配置上限时提示用户，不继续加入文件。 */
function handleExceed() {
  feedback.warning(`最多只能上传 ${props.limit} 个文件`);
}
/** 先请求删除服务端文件，成功且模型版本未变才移除本地项；失败保留文件供重试。 */
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
/** 调用公共下载接口；失败时保留文件列表，错误提示由请求或下载工具处理。 */
async function handleDownload(file: UploadUserFile) {
  if (!file.url) return;
  try {
    await FileAPI.download(file.url, file.name);
  } catch {
    feedback.error("文件下载失败，请重试。");
  }
}
</script>
<style scoped>
.file-upload {
  width: 100%;
  max-width: 640px;
  min-width: 0;
}
.file-upload__hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 6px;
}
.file-upload__list {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.file-upload__list > li {
  min-width: 0;
}
</style>
