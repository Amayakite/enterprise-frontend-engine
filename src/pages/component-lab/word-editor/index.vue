<template>
  <section class="word-lab">
    <header class="word-lab__header">
      <div>
        <h1>Word 合同编辑试用</h1>
        <p>导入 Word 合同模板，编辑内容、插入变量并导出。文件仅在本地浏览器处理。</p>
      </div>
      <el-button @click="router.push('/base/sale')">返回销售组织</el-button>
    </header>
    <div class="word-lab__tools">
      <el-button :disabled="busy" @click="input?.click()">导入 DOCX</el-button>
      <input
        ref="input"
        class="word-lab__input"
        type="file"
        accept=".docx"
        aria-label="导入 DOCX 文件"
        @change="importFile"
      />
      <el-button :disabled="!bytes || busy" @click="openOriginal">预览原文件</el-button>
      <el-button
        :disabled="!ready || busy"
        :loading="exporting"
        type="primary"
        @click="exportDocument"
      >
        导出 DOCX
      </el-button>
      <el-button :disabled="!lastExport || busy" @click="openExport">预览上次导出</el-button>
    </div>
    <div class="word-lab__variables">
      <span>插入变量</span>
      <el-button
        v-for="variable in variables"
        :key="variable"
        :disabled="!ready || busy"
        @mousedown.prevent
        @click="insertVariable(variable)"
      >
        {{ variable }}
      </el-button>
      <el-input
        v-model="customVariable"
        placeholder="自定义变量名"
        aria-label="自定义变量名"
        maxlength="40"
        class="word-lab__custom"
      />
      <el-button
        :disabled="!ready || busy || !customVariable.trim()"
        @mousedown.prevent
        @click="insertCustomVariable"
      >
        插入自定义变量
      </el-button>
    </div>
    <MyFeedback
      message="试用范围：普通文本变量和 DOCX 往返编辑。中文字体暂使用本机字体，跨设备排版可能变化；复杂模板请核对导出结果。"
    />
    <MyFeedback v-if="error" tone="error" :message="error">
      <el-button :disabled="busy || !bytes" @click="retry">重新加载原文件</el-button>
    </MyFeedback>
    <div class="word-lab__status" role="status">
      <span>{{ filename || "尚未导入文件" }}</span>
      <span>
        {{
          loading
            ? "正在加载编辑器与文档…"
            : ready
              ? dirty
                ? "有未导出的修改"
                : "已就绪"
              : "请选择 DOCX 文件"
        }}
      </span>
    </div>
    <div v-if="!bytes" class="word-lab__empty">
      <h2>先导入一份合同模板</h2>
      <p>支持 .docx，单个文件不超过 10 MB。选中编辑位置后，点击上方变量即可插入。</p>
      <p>编辑完成后请导出，刷新页面不会保留修改。</p>
    </div>
    <div v-else class="word-lab__editor" :aria-busy="loading">
      <EigenPalEditor
        :key="generation"
        ref="editor"
        :document="bytes"
        :name="filename"
        @ready="onReady"
        @change="onChange"
        @error="onError"
      />
    </div>
    <FilePreviewDialog v-model="previewOpen" :files="previewFiles" />
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, shallowRef } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import FilePreviewDialog from "@/components/common/FilePreview/FilePreviewDialog.vue";
import type { FilePreviewItem } from "@/components/common/FilePreview/types";
import type { WordEditorHandle } from "@/components/common/WordEditor/types";
import { docxMime } from "@/config/document-assets";
import { validateDocx } from "@/components/common/WordEditor/validate-docx";
import { feedback } from "@/utils/feedback";
import { downloadFile } from "@/utils/download";

/** 编辑器按需加载，首次进入空页不加载编辑器。 */
const EigenPalEditor = defineAsyncComponent({
  loader: () => import("@/components/common/WordEditor/EigenPalEditor.vue"),
  onError: (cause, _retry, fail) => {
    onError(cause.message);
    fail();
  },
});
const router = useRouter();
const editor = shallowRef<WordEditorHandle>();
const input = ref<HTMLInputElement>();
/** 原始字节用于预览和失败重试；编辑草稿只存在于当前编辑器实例。 */
const bytes = shallowRef<ArrayBuffer>();
const filename = ref("");
const generation = ref(0);
const ready = ref(false);
const loading = ref(false);
const reading = ref(false);
const exporting = ref(false);
const busy = computed(() => reading.value || exporting.value);
const dirty = ref(false);
const error = ref("");
let editRevision = 0;
let disposed = false;
/** 保存上次导出快照，不把预览称为当前编辑内容。 */
const lastExport = shallowRef<FilePreviewItem>();
const previewOpen = ref(false);
const previewFiles = shallowRef<readonly FilePreviewItem[]>([]);
const variables = ["[[甲方名称]]", "[[乙方名称]]", "[[合同金额]]", "[[甲方盖章]]"];
const customVariable = ref("");

/** 只有已编辑且未导出的内容才需要确认，取消保留整个实例。 */
async function canDiscard() {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      "当前有未导出的修改。继续会丢弃这些修改，建议先导出 DOCX。",
      "离开当前文档",
      { confirmButtonText: "丢弃修改并继续", cancelButtonText: "继续编辑", type: "warning" }
    );
    return true;
  } catch {
    return false;
  }
}
/** 重建实例清除旧引擎的选区和撤销历史，原始字节不变。 */
function resetEditor() {
  ready.value = false;
  loading.value = Boolean(bytes.value);
  dirty.value = false;
  error.value = "";
  lastExport.value = undefined;
  editRevision++;
  generation.value++;
}
/** 扩展名及大小先行校验；不冒充格式安全验证，解析错误由引擎报告。 */
async function importFile(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || busy.value) return;
  if (!/\.docx$/i.test(file.name) || file.size > 10 * 1024 * 1024 || file.size === 0) {
    feedback.warning("请选择非空 DOCX 文件，大小不超过 10 MB。");
    return;
  }
  if (!(await canDiscard()) || disposed) return;
  reading.value = true;
  try {
    const buffer = await file.arrayBuffer();
    await validateDocx(buffer);
    if (disposed) return;
    bytes.value = buffer;
    filename.value = file.name;
    resetEditor();
  } catch (cause) {
    if (!disposed)
      feedback.error(cause instanceof Error ? cause.message : "文件读取失败，请重试。");
  } finally {
    reading.value = false;
  }
}
function onReady() {
  ready.value = true;
  loading.value = false;
}
function onChange() {
  dirty.value = true;
  editRevision++;
}
function onError(message: string) {
  error.value = message;
  loading.value = false;
  ready.value = false;
}
async function retry() {
  if (await canDiscard()) resetEditor();
}
/** 错误仅在宿主显示一次，底层适配器不自行弹提示。 */
function insertVariable(value: string) {
  try {
    editor.value?.insertVariable(value);
  } catch (cause) {
    feedback.error(cause instanceof Error ? cause.message : "变量插入失败");
  }
}
function insertCustomVariable() {
  const value = customVariable.value.trim();
  if (!value || /[\[\]\r\n]/.test(value)) {
    feedback.warning("变量名不要包含方括号或换行。");
    return;
  }
  insertVariable(`[[${value}]]`);
}
/** 导出只生成本地文件；异步导出期间继续编辑时保留未导出标记。 */
async function exportDocument() {
  if (!editor.value || !ready.value || busy.value) return;
  exporting.value = true;
  const revision = editRevision;
  const name = `${filename.value.replace(/\.docx$/i, "")}-eigenpal.docx`;
  try {
    const result = await editor.value.exportDocx(name);
    if (disposed) return;
    if (!result.downloadStarted) downloadFile({ data: result.blob, headers: {} }, name);
    lastExport.value = { name, blob: result.blob };
    if (editRevision === revision) dirty.value = false;
    feedback.success("DOCX 已生成并发起下载，可预览上次导出。");
  } catch (cause) {
    if (!disposed) feedback.error(cause instanceof Error ? cause.message : "DOCX 导出失败");
  } finally {
    exporting.value = false;
  }
}
async function openOriginal() {
  if (!bytes.value) return;
  previewFiles.value = [
    { name: filename.value, blob: new Blob([bytes.value], { type: docxMime }) },
  ];
  // 先让预览器接收文件组，再打开；其文件组监听会关闭旧预览。
  await nextTick();
  if (!disposed) previewOpen.value = true;
}
async function openExport() {
  if (!lastExport.value) return;
  previewFiles.value = [lastExport.value];
  await nextTick();
  if (!disposed) previewOpen.value = true;
}
/** 刷新/关闭浏览器使用原生离开保护，站内路由使用同一未导出状态。 */
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || exporting.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
window.addEventListener("beforeunload", beforeUnload);
onBeforeRouteLeave(async () => !exporting.value && (await canDiscard()));
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<style scoped>
.word-lab {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.word-lab__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.word-lab h1 {
  margin: 0 0 8px;
  font-size: 22px;
}
.word-lab p {
  margin: 6px 0;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.word-lab__tools,
.word-lab__variables {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.word-lab__variables {
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.word-lab__custom {
  width: 160px;
}
.word-lab__input {
  display: none;
}
.word-lab__status {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
.word-lab__editor {
  height: 76vh;
  min-height: 480px;
  min-width: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}
.word-lab__empty {
  padding: 50px 24px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  text-align: center;
}
@media (max-width: 640px) {
  .word-lab {
    padding: 12px;
  }
  .word-lab__header {
    flex-direction: column;
  }
}
</style>
