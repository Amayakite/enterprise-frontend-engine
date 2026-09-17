<!--
 * 基于 wangEditor-next 的富文本编辑器组件二次封装
 * 版权所属 © 2021-present 有来开源组织
 *
 * 开源协议：https://opensource.org/licenses/MIT
 * 项目地址：https://gitee.com/youlaiorg/vue3-element-admin
 *
 * 在使用时，请保留此注释，感谢您对开源的支持
-->

<template>
  <div style="z-index: 999; border: 1px solid var(--el-border-color)">
    <!-- 工具栏 -->
    <Toolbar
      v-if="editorRef"
      :key="editorKey"
      :editor="editorRef"
      mode="simple"
      :default-config="toolbarConfig"
      style="border-bottom: 1px solid var(--el-border-color)"
    />
    <!-- 编辑器 -->
    <Editor
      :key="editorKey"
      v-model="modelValue"
      :style="{ height: height, overflowY: 'hidden' }"
      :default-config="editorConfig"
      mode="simple"
      @on-created="handleCreated"
      @on-change="handleChange"
    />
  </div>
</template>

<script setup lang="ts">
import "@wangeditor-next/editor/dist/css/style.css";
import { Toolbar, Editor } from "@wangeditor-next/editor-for-vue";
import type { IToolbarConfig, IEditorConfig, IDomEditor } from "@wangeditor-next/editor";

// 文件上传 API
import FileAPI from "@/api/file";

// 上传图片回调函数类型
type InsertFnType = (_url: string, _alt: string, _href: string) => void;

const props = withDefaults(
  defineProps<{
    /** 编辑区域 CSS 高度，不含工具栏；默认 500px。 */
    height?: string;
    /** 编辑器空值提示，默认“请输入内容”。 */
    placeholder?: string;
    /** 可见文本 UTF-16 长度限制；正整数，省略不限，不计算 HTML 标签。 */
    maxlength?: number;
  }>(),
  { height: "500px", placeholder: "请输入内容" }
);

// 双向绑定 - 直接使用 v-model，无需手动 setHtml
const modelValue = defineModel<string>({
  type: String,
  required: false,
  default: "",
});

// 编辑器实例，必须用 shallowRef
const editorRef = shallowRef<IDomEditor | null>(null);

const editorKey = ref(0);
const innerUpdating = ref(false);

// 工具栏配置
const toolbarConfig: Partial<IToolbarConfig> = {};

const uploads = new Set<AbortController>();

// 编辑器配置
const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  maxLength: props.maxlength,
  MENU_CONF: {
    uploadImage: {
      async customUpload(file: File, insertFn: InsertFnType) {
        const editor = editorRef.value;
        const request = new AbortController();
        uploads.add(request);
        try {
          const data = new FormData();
          data.append("file", file);
          const res = await FileAPI.upload(data, undefined, request.signal);
          // 插入图片
          if (editor && editorRef.value === editor && !editor.isDestroyed)
            insertFn(res.url, res.name, res.url);
        } catch {
          // 请求层统一提示，不向已销毁或已替换的编辑器插入结果。
        } finally {
          uploads.delete(request);
        }
      },
    },
  },
};

// 记录 editor 实例
const handleCreated = (editor: IDomEditor) => {
  editorRef.value = editor;
};

const handleChange = () => {
  innerUpdating.value = true;
  Promise.resolve().then(() => {
    innerUpdating.value = false;
  });
};

watch(
  () => modelValue.value,
  () => {
    if (innerUpdating.value) return;
    editorRef.value?.destroy();
    editorRef.value = null;
    editorKey.value += 1;
  }
);

// 组件销毁时，也及时销毁编辑器，重要！
onBeforeUnmount(() => {
  uploads.forEach((request) => request.abort());
  uploads.clear();
  const editor = editorRef.value;
  if (editor == null) return;
  editor.destroy();
});
</script>
