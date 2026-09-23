<template>
  <div class="rich-text-input" :style="{ minHeight: height }" :aria-busy="loading">
    <component
      v-if="editor"
      :is="editor"
      :model-value="modelValue"
      :height="height"
      :placeholder="placeholder"
      :maxlength="maxlength"
      @update:model-value="onChange"
    />
    <div v-else-if="error" class="rich-text-input__status" role="alert">
      <span>编辑器加载失败，已填写内容仍保留。</span>
      <el-button @click="load">重新加载</el-button>
    </div>
    <div v-else class="rich-text-input__status" role="status">正在加载编辑器…</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, ref } from "vue";
import type WangEditor from "@/components/common/WangEditor.vue";
const props = withDefaults(
  defineProps<{
    /** HTML 字符串；加载及重试不会清空；空值用空字符串。 */
    modelValue: string;
    /** 编辑内容区高度，默认 240px。 */
    height?: string;
    /** 未输入时提示，默认“请输入内容”。 */
    placeholder?: string;
    /** 可见文本长度上限；省略不限，仍由表单校验兜底。 */
    maxlength?: number;
  }>(),
  { height: "240px", placeholder: "请输入内容" }
);
const emit = defineEmits<{
  /** 用户编辑后回写 HTML；不保存服务器，加载失败不触发。
   * @example
   * `<RichTextInput v-model="description" />`
   */
  "update:modelValue": [value: string];
}>();
/** 按需加载的富文本组件，加载完成前不创建重量编辑器。 */
const editor = shallowRef<typeof WangEditor>();
/** 富文本模块正在加载，防止重复导入并显示等待提示。 */
const loading = ref(false);
/** 记录模块加载失败，使界面可以提示用户重试。 */
const error = ref(false);
/** 卸载标记，异步导入完成后先检查，避免更新已经离开的输入框。 */
let alive = true;
/** 按需导入富文本编辑器，捕获模块加载失败并保留重试机会。 */
async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = false;
  try {
    const loaded = await import("@/components/common/WangEditor.vue");
    if (alive) editor.value = loaded.default;
  } catch {
    if (alive) error.value = true;
  } finally {
    if (alive) loading.value = false;
  }
}
/** 编辑器内容与当前值不同且组件尚未卸载时通知父页面，避免重复回写或卸载后继续更新。 */
function onChange(value: string) {
  if (alive && value !== props.modelValue) emit("update:modelValue", value);
}
/** 需要真正显示输入时才加载编辑器，普通字段不会提前承担这部分开销。 */
onMounted(load);
/** 标记组件已离开，之后的异步模块加载结果不再更新界面。 */
onBeforeUnmount(() => {
  alive = false;
});
</script>

<style scoped>
.rich-text-input {
  width: 100%;
  min-width: 0;
}
.rich-text-input__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: inherit;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
</style>
