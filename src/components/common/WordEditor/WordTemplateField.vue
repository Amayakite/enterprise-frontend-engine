<template>
  <!-- 业务模型只保存文件引用；编辑器字节在弹窗内，应用后上传并回填字段。 -->
  <section class="word-template">
    <FileAttachment
      v-if="modelValue"
      :name="modelValue.name"
      :removable="!readonly"
      @preview="previewSaved"
      @download="downloadSaved"
      @remove="emit('update:modelValue', null)"
    />
    <div v-else class="word-template__empty">
      <el-icon :size="26"><Document /></el-icon>
      <div>
        <strong>公司合同模板</strong>
        <p>导入 Word，编辑内容并插入业务变量。</p>
      </div>
    </div>
    <el-button v-if="!readonly" type="primary" plain @click="open">
      {{ modelValue ? "编辑 Word 模板" : "导入 Word 模板" }}
    </el-button>
    <MyFeedback v-if="error && !visible" tone="error" :message="error" />
    <MyDialog
      v-model="visible"
      title="公司合同模板"
      width="1440px"
      :body-padding="false"
      fill-height
      body-scroll="content"
      :before-close="canClose"
      @closed="reset"
    >
      <div class="word-template__workspace">
        <div class="word-template__toolbar">
          <el-button :disabled="busy" @click="input?.click()">导入 DOCX</el-button>
          <input
            ref="input"
            type="file"
            accept=".docx"
            class="word-template__input"
            aria-label="导入 DOCX 文件"
            @change="importFile"
          />
          <el-popover
            v-model:visible="variablesOpen"
            trigger="click"
            placement="bottom-start"
            :width="280"
            :teleported="false"
            @after-enter="variablesPanel?.focus()"
          >
            <template #reference>
              <el-button ref="variablesTrigger" :disabled="!ready || busy" @mousedown.prevent>
                插入变量
              </el-button>
            </template>
            <div
              ref="variablesPanel"
              class="word-template__variables"
              tabindex="-1"
              aria-label="选择合同变量"
              @keydown.esc.stop.prevent="closeVariables"
            >
              <span>先在正文中定位，再选择变量</span>
              <div class="word-template__variable-options">
                <el-button
                  v-for="variable in variables"
                  :key="variable"
                  :disabled="!ready || busy"
                  @mousedown.prevent
                  @click="insert(variable)"
                >
                  {{ variable }}
                </el-button>
              </div>
              <div class="word-template__custom-variable">
                <el-input
                  v-model="customVariable"
                  aria-label="自定义变量"
                  placeholder="自定义变量名"
                  maxlength="40"
                />
                <el-button
                  :disabled="!ready || busy || !customVariable.trim()"
                  @mousedown.prevent
                  @click="insert(`[[${customVariable.trim()}]]`)"
                >
                  插入
                </el-button>
              </div>
            </div>
          </el-popover>
          <el-button :disabled="!ready || busy" @click="previewCurrent">预览</el-button>
        </div>
        <MyFeedback v-if="error" tone="error" :message="error" />
        <div v-if="!bytes" v-loading="busy" class="word-template__welcome">
          <el-icon :size="48"><Document /></el-icon>
          <h2>从现有合同开始</h2>
          <p>导入一份 DOCX 模板，在正文中插入公司名称、合同金额等变量。</p>
          <el-button type="primary" :disabled="busy" @click="input?.click()">
            选择 Word 文件
          </el-button>
          <el-text size="small" type="info">支持 .docx，单个文件不超过 10 MB</el-text>
        </div>
        <div v-else v-loading="!ready && !error" class="word-template__editor">
          <EigenPalEditor
            :key="generation"
            ref="editor"
            :document="bytes"
            :name="filename"
            @ready="ready = true"
            @change="dirty = true"
            @error="onError"
          />
        </div>
      </div>
      <template #footer>
        <div class="word-template__footer">
          <div class="word-template__status">
            <strong :title="filename">{{ filename || "尚未导入文档" }}</strong>
            <span>应用后仍需保存公司档案</span>
          </div>
          <div>
            <el-button :disabled="busy" @click="close">取消</el-button>
            <el-button :disabled="!ready || busy" @click="downloadCurrent">导出 DOCX</el-button>
            <el-button type="primary" :disabled="!ready || busy" :loading="applying" @click="apply">
              应用到公司档案
            </el-button>
          </div>
        </div>
      </template>
    </MyDialog>
    <FilePreviewDialog v-model="previewOpen" :files="previewFiles" />
  </section>
</template>
<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowRef,
} from "vue";
import type { DeepReadonly } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { Document } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import type { ButtonInstance } from "element-plus";
import MyDialog from "@/components/common/MyDialog.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import FileAttachment from "@/components/common/FilePreview/FileAttachment.vue";
import FilePreviewDialog from "@/components/common/FilePreview/FilePreviewDialog.vue";
import type { FilePreviewItem } from "@/components/common/FilePreview/types";
import FileAPI from "@/api/file";
import type { FileInfo } from "@/api/file/types";
import type { WordEditorHandle } from "./types";
import { validateDocx } from "./validate-docx";
import { downloadFile } from "@/utils/download";
import { docxMime } from "@/config/document-assets";
const props = defineProps<{
  /** 已关联的 DOCX 文件引用，null 为未配置；字节不进入主表和本机草稿。 */
  modelValue: DeepReadonly<FileInfo> | null;
  /** 默认 false；详情设为 true，仅允许统一文件预览和下载。 */
  readonly?: boolean;
}>();
const emit = defineEmits<{
  /** 应用时上传导出文件并回填引用；移除时返回 null，不物理删除历史附件。
   * @example
   * <WordTemplateField :model-value="value" @update:model-value="v => { update(v); commit(); }" />
   */
  "update:modelValue": [value: FileInfo | null];
}>();
/** 仅导入后加载 EigenPal；失败留在当前弹窗并提供文案。 */
const EigenPalEditor = defineAsyncComponent({
  loader: () => import("./EigenPalEditor.vue"),
  onError: (cause, _retry, fail) => {
    onError(cause.message);
    fail();
  },
});
const editor = shallowRef<WordEditorHandle>();
const input = ref<HTMLInputElement>();
const visible = ref(false);
/** 变量面板按需展开；打开后将键盘焦点移入面板，Tab 可依次选择变量。 */
const variablesOpen = ref(false);
const variablesPanel = ref<HTMLElement>();
const variablesTrigger = ref<ButtonInstance>();
/** Esc 只收起变量面板，并将焦点交还入口，保留正文选区。 */
async function closeVariables() {
  variablesOpen.value = false;
  await nextTick();
  variablesTrigger.value?.ref?.focus();
}
const bytes = shallowRef<ArrayBuffer>();
const filename = ref("");
const generation = ref(0);
const ready = ref(false);
const dirty = ref(false);
const reading = ref(false);
const exporting = ref(false);
const applying = ref(false);
const busy = computed(() => reading.value || exporting.value || applying.value);
const error = ref("");
const customVariable = ref("");
const variables = ["[[公司名称]]", "[[甲方名称]]", "[[合同金额]]", "[[甲方盖章]]"];
const previewOpen = ref(false);
const previewFiles = shallowRef<readonly FilePreviewItem[]>([]);
let controller = new AbortController();
/** 关闭/替换前保护尚未应用的内容；取消确认保留原编辑器实例。 */
async function canDiscard() {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm("文档尚未应用到公司档案，继续会丢弃本次编辑。", "保留当前编辑？", {
      confirmButtonText: "丢弃编辑",
      cancelButtonText: "继续编辑",
      type: "warning",
    });
    return true;
  } catch {
    return false;
  }
}
async function canClose() {
  return !busy.value && (await canDiscard());
}
async function close() {
  if (await canClose()) visible.value = false;
}
/** 关闭后释放二进制及 SDK，下次读取已确认的字段引用。 */
function reset() {
  variablesOpen.value = false;
  controller.abort();
  bytes.value = undefined;
  ready.value = false;
  dirty.value = false;
  error.value = "";
}
function onError(message: string) {
  error.value = message;
}
/** 已存模板通过统一文件 API 读取，失效引用给出错误，仍允许重新导入。 */
async function open() {
  if (props.readonly) return;
  reset();
  controller = new AbortController();
  visible.value = true;
  filename.value = props.modelValue?.name ?? "";
  if (!props.modelValue) return;
  reading.value = true;
  try {
    const response = await FileAPI.read(props.modelValue.url, controller.signal);
    const buffer = await response.data.arrayBuffer();
    await validateDocx(buffer);
    if (!controller.signal.aborted) {
      bytes.value = buffer;
      generation.value++;
    }
  } catch {
    if (!controller.signal.aborted)
      error.value = "模板读取失败，请重新导入 DOCX；开发附件可能已随服务重启清空。";
  } finally {
    reading.value = false;
  }
}
/** 导入只写弹窗草稿；先校验再替换，错误文件不会丢掉旧文档。 */
async function importFile(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || busy.value) return;
  if (!/\.docx$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) {
    error.value = "请选择非空 DOCX 文件，大小不超过 10 MB。";
    return;
  }
  if (!(await canDiscard())) return;
  reading.value = true;
  try {
    const buffer = await file.arrayBuffer();
    await validateDocx(buffer);
    if (controller.signal.aborted) return;
    ready.value = false;
    bytes.value = buffer;
    filename.value = file.name;
    generation.value++;
    dirty.value = true;
    error.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "导入失败，请重试。";
  } finally {
    reading.value = false;
  }
}
function insert(text: string) {
  try {
    editor.value?.insertVariable(text);
    variablesOpen.value = false;
  } catch {
    error.value = "请先在正文中选择插入位置，再重试。";
  }
}
/** 当前导出供预览/下载/回填复用；序列化失败保留编辑内容。 */
async function snapshot() {
  if (!ready.value || !editor.value) throw new Error("文档尚未就绪");
  return (await editor.value.exportDocx(filename.value)).blob;
}
async function previewCurrent() {
  exporting.value = true;
  try {
    previewFiles.value = [{ name: filename.value, blob: await snapshot() }];
    previewOpen.value = true;
  } catch {
    error.value = "预览生成失败，编辑内容已保留。";
  } finally {
    exporting.value = false;
  }
}
async function downloadCurrent() {
  exporting.value = true;
  try {
    downloadFile({ data: await snapshot(), headers: {} }, filename.value);
  } catch {
    error.value = "导出失败，请重试。";
  } finally {
    exporting.value = false;
  }
}
function previewSaved() {
  if (props.modelValue) {
    previewFiles.value = [{ ...props.modelValue }];
    previewOpen.value = true;
  }
}
async function downloadSaved() {
  if (!props.modelValue) return;
  try {
    await FileAPI.download(props.modelValue.url, props.modelValue.name);
  } catch {
    error.value = "文件下载失败，请重新打开模板或重试。";
  }
}
/** 上传新版本后才回填；不覆写旧附件，主表仍由 MyCRUD 保存。 */
async function apply() {
  if (busy.value || !ready.value) return;
  applying.value = true;
  error.value = "";
  try {
    const blob = await snapshot();
    if (blob.size > 10 * 1024 * 1024) throw new Error("模板导出后超过10MB");
    const file = await FileAPI.uploadFile(
      new File([blob], filename.value, { type: docxMime }),
      controller.signal,
      "local"
    );
    if (controller.signal.aborted) return;
    emit("update:modelValue", file);
    dirty.value = false;
    visible.value = false;
  } catch {
    if (!controller.signal.aborted) error.value = "模板上传失败，编辑内容已保留，请重试应用。";
  } finally {
    applying.value = false;
  }
}
/** 路由离开和刷新均保护未应用文档；主表已确认值继续由 MyCRUD 草稿保护。 */
onBeforeRouteLeave(() => !visible.value || canClose());
function beforeUnload(event: BeforeUnloadEvent) {
  if (visible.value && dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
window.addEventListener("beforeunload", beforeUnload);
onDeactivated(() => {
  visible.value = false;
  reset();
});
onBeforeUnmount(() => {
  controller.abort();
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>
<style scoped lang="scss">
.word-template {
  width: 100%;
  display: grid;
  gap: 12px;
  justify-items: start;
  &__empty {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px;
    width: 100%;
    border: 1px dashed var(--el-border-color);
    border-radius: 10px;
    color: var(--el-text-color-regular);
    p {
      margin: 5px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }
  }
  &__workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 0;
  }
  &__toolbar {
    padding: 8px 16px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    > * {
      flex-shrink: 0;
    }
  }
  &__input {
    display: none;
  }
  &__variables {
    display: grid;
    gap: 12px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  &__variable-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    > * {
      margin: 0;
    }
  }
  &__custom-variable {
    display: flex;
    gap: 8px;
  }
  &__editor {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    overflow: hidden;
  }
  &__welcome {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 18px;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-secondary);
    h2,
    p {
      margin: 0;
    }
  }
  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
    > div {
      min-width: 0;
    }
    > div:last-child {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      > * {
        margin: 0;
      }
    }
    @media (max-width: 760px) {
      flex-wrap: wrap;
    }
  }
  &__status {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    strong {
      min-width: 0;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--el-text-color-regular);
    }
  }
}
</style>
