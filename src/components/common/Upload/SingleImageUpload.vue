<template>
  <div class="single-upload" :style="props.style" :aria-busy="busy">
    <template v-if="modelValue">
      <el-image
        class="single-upload__image"
        :src="modelValue"
        :preview-src-list="[modelValue]"
        fit="contain"
        alt="已上传图片"
      />
      <el-button
        class="single-upload__remove"
        size="small"
        type="danger"
        aria-label="删除图片"
        @click="handleDelete"
      >
        删除
      </el-button>
    </template>
    <el-upload
      v-else
      :show-file-list="false"
      :accept="props.accept"
      :disabled="busy"
      :before-upload="uploader.beforeUpload"
      :http-request="handleUpload"
      :on-error="handleError"
    >
      <el-button
        class="single-upload__trigger"
        :style="{ width: props.style.width ?? '150px', height: props.style.height ?? '150px' }"
        :loading="busy"
        aria-label="上传图片"
      >
        <el-icon v-if="!busy"><Plus /></el-icon>
        <span>{{ busy ? "上传中" : "上传图片" }}</span>
      </el-button>
    </el-upload>
  </div>
</template>
<script setup lang="ts">
import type { UploadRequestOptions } from "element-plus";
import type { SingleImageUploadProps } from "./types";
import { useUpload } from "./useUpload";
const props = withDefaults(defineProps<SingleImageUploadProps>(), {
  data: () => ({}),
  name: "file",
  maxFileSize: 10,
  accept: "image/*",
  style: () => ({ width: "150px", height: "150px" }),
});
/** 已上传图片 URL；默认空串，外部替换会取消旧上传。 */
const modelValue = defineModel<string>({ default: "" });
const busy = ref(false);
const uploader = useUpload(() => props);
let version = 0;
let published: string | undefined;
watch(
  modelValue,
  (url) => {
    if (url === published) {
      published = undefined;
      return;
    }
    version++;
    uploader.reset();
    busy.value = false;
  },
  { flush: "sync" }
);
async function handleUpload(options: UploadRequestOptions) {
  const current = version;
  busy.value = true;
  try {
    const info = await uploader.upload(options);
    published = info.url;
    modelValue.value = info.url;
    ElMessage.success("上传成功");
    return info;
  } finally {
    if (current === version) busy.value = false;
  }
}
function handleDelete() {
  modelValue.value = "";
}
function handleError(_error: unknown) {
  // 请求层统一提示；主动取消不提示错误。
}
</script>
<style scoped>
.single-upload {
  position: relative;
  max-width: 100%;
}
.single-upload__image {
  width: 100%;
  height: 100%;
  border-radius: var(--el-border-radius-base);
}
.single-upload__trigger {
  max-width: 100%;
  white-space: normal;
}
.single-upload__remove {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
