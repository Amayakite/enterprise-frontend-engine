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
/** 上传控件中的本地文件项，包含进度和状态；对外模型只保存成功上传的文件信息。 */
const fileList = ref<UploadUserFile[]>([]);
/** 上传组件公开实例，外部整体替换文件列表时用它取消旧上传。 */
const uploadRef = ref<UploadInstance>();
/** 控制图片预览层是否打开，替换模型或删除图片时关闭旧预览。 */
const previewVisible = ref(false);
/** 预览从已成功上传图片中的哪一张开始，不按临时上传列表索引定位。 */
const previewImageIndex = ref(0);
/** 正在删除的文件 URL 集合，防止同一文件重复发起删除请求。 */
const deleting = reactive(new Set<string>());
/** 记住本组件刚发布的文件列表，识别父级 v-model 回传，避免重置仍在上传的其他项。 */
let published: string[] | undefined;
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
function publish(urls: string[]) {
  published = [...urls];
  modelValue.value = urls;
}
/** 外部整体替换模型时取消旧上传并重建列表；自身发布的值回传时保留当前上传状态。 */
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
/** 使正在执行的删除等异步结果失效，避免卸载后回写父页面。 */
onBeforeUnmount(() => {
  alive = false;
  modelVersion++;
});
/** 先请求删除服务端文件，成功且模型版本未变才移除本地项；失败保留文件供重试。 */
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
/** 选择数量超过配置上限时提示用户，不继续加入文件。 */
function handleExceed() {
  ElMessage.warning(`最多只能上传 ${props.limit} 张图片`);
}
/** 只接收仍在列表中的上传项，更新地址和状态后发布全部成功文件。 */
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
/** 上传错误已由公共请求处理；此处不重复弹出消息，主动取消也保持安静。 */
function handleError(_error: unknown) {
  // 请求层统一提示；主动取消不提示错误。
}
/** 根据图片 URL 找到正式模型中的位置，定位成功后打开预览。 */
function handlePreviewImage(file: UploadUserFile) {
  const index = file.url ? modelValue.value.indexOf(file.url) : -1;
  if (index < 0) return;
  previewImageIndex.value = index;
  previewVisible.value = true;
}
/** 只关闭图片预览，不改变已上传图片或选择值。 */
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
