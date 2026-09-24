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
// TODO(image-customization): 在上传前组合头像裁剪、固定比例及压缩；取消处理应保留原图片。
// 当前 image 仅提供单图上传、展示和预览，不把图片编辑能力耦合到附件预览器。
import { feedback } from "@/utils/feedback";
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
/** 当前图片是否正在上传，防止重复点击并显示等待状态。 */
const busy = ref(false);
/** 复用公共上传检查和请求取消逻辑，遵守本字段的大小、类型等配置。 */
const uploader = useUpload(() => props);
/** 外部替换图片时递增，旧上传结束不能清除新一轮的忙碌状态。 */
let version = 0;
/** 记住刚上传发布的 URL，父级回传时不误判为需要取消上传的外部替换。 */
let published: string | undefined;
/** 外部换图或清空时取消旧上传；本次成功上传的 URL 回传则保留当前状态。 */
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
/** 执行公共上传并将成功 URL 回写模型，结束时只清理当前版本的忙碌状态。 */
async function handleUpload(options: UploadRequestOptions) {
  const current = version;
  busy.value = true;
  try {
    const info = await uploader.upload(options);
    published = info.url;
    modelValue.value = info.url;
    feedback.success("上传成功");
    return info;
  } finally {
    if (current === version) busy.value = false;
  }
}
/** 清空字段引用的图片 URL，不在这里请求删除服务端文件。 */
function handleDelete() {
  modelValue.value = "";
}
/** 请求层已处理上传错误，这里避免重复提示和取消后的错误弹窗。 */
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
