<template>
  <div class="canvas-host">
    <div class="canvas-tools" role="toolbar" aria-label="文档格式">
      <el-button :disabled="!ready" @mousedown.prevent @click="instance?.command.executeUndo()">
        撤销
      </el-button>
      <el-button :disabled="!ready" @mousedown.prevent @click="instance?.command.executeRedo()">
        重做
      </el-button>
      <el-button :disabled="!ready" @mousedown.prevent @click="instance?.command.executeBold()">
        加粗
      </el-button>
      <el-button :disabled="!ready" @mousedown.prevent @click="instance?.command.executeItalic()">
        斜体
      </el-button>
      <el-button
        :disabled="!ready"
        @mousedown.prevent
        @click="instance?.command.executeUnderline()"
      >
        下划线
      </el-button>
      <el-button
        :disabled="!ready"
        @mousedown.prevent
        @click="instance?.command.executeRowFlex(RowFlex.LEFT)"
      >
        左对齐
      </el-button>
      <el-button
        :disabled="!ready"
        @mousedown.prevent
        @click="instance?.command.executeRowFlex(RowFlex.CENTER)"
      >
        居中
      </el-button>
      <el-button :disabled="!ready" @mousedown.prevent @click="instance?.command.executeSizeAdd()">
        增大字号
      </el-button>
      <el-button
        :disabled="!ready"
        @mousedown.prevent
        @click="instance?.command.executeSizeMinus()"
      >
        减小字号
      </el-button>
      <el-select v-model="scale" aria-label="文档缩放" style="width: 100px" @change="onScale">
        <el-option
          v-for="value in [0.5, 0.75, 1, 1.25]"
          :key="value"
          :label="`${value * 100}%`"
          :value="value"
        />
      </el-select>
    </div>
    <div class="canvas-scroll"><div ref="container" /></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import Editor, { RowFlex } from "@hufe921/canvas-editor";
import docxPlugin from "@hufe921/canvas-editor-plugin-docx";
import { documentFontSources } from "@/config/document-assets";
import type { WordEditorProps, WordEditorEmits, WordEditorHandle } from "./types";

const props = defineProps<WordEditorProps>();
const emit = defineEmits<WordEditorEmits>();
const container = ref<HTMLDivElement>();
const ready = ref(false);
const scale = ref(1);
/** 原生实例不放进深层响应式代理，卸载时释放编辑器监听及本组件字体。 */
let instance: Editor | undefined;
let disposed = false;
const loadedFonts: FontFace[] = [];

/** 字体就绪后导入；旧页面卸载后的异步结果不再创建实例或发出通知。 */
onMounted(async () => {
  try {
    await Promise.all(
      documentFontSources.map(async (source) => {
        const font = new FontFace(source.family, `url("${source.url}")`, {
          weight: String(source.weight),
          style: source.style,
        });
        await font.load();
        if (!disposed) {
          document.fonts.add(font);
          loadedFonts.push(font);
        }
      })
    );
    if (disposed || !container.value) return;
    instance = new Editor(container.value, [{ value: "" }], {
      defaultFont: "Times New Roman",
      locale: "zh-CN",
    });
    instance.use(docxPlugin);
    // 插件声明返回 void，实际实现返回 Promise；await 同时兼容两者，不伪造类型断言。
    await instance.command.executeImportDocx({ arrayBuffer: props.document.slice(0) });
    if (disposed) return;
    instance.listener.contentChange = () => emit("change");
    instance.command.executeSetRange(0, 0);
    ready.value = true;
    emit("ready");
  } catch (error) {
    if (!disposed) emit("error", error instanceof Error ? error.message : "DOCX 导入失败");
  }
});
onBeforeUnmount(() => {
  disposed = true;
  ready.value = false;
  instance?.destroy();
  loadedFonts.forEach((font) => document.fonts.delete(font));
});

/** 缩放只调整显示比例，不改变 DOCX 的纸张大小。 */
function onScale() {
  instance?.command.executePageScale(scale.value);
}
/** 在编辑器保留的选区处插入文本，工具栏 mousedown 不抢走文档选区。 */
function insertVariable(text: string) {
  if (!ready.value || !instance) throw new Error("编辑器尚未就绪");
  instance.command.executeInsertElementList([{ value: text }]);
}
/** 官方插件导出并启动下载，同时返回 Blob 供宿主保留本次导出预览。 */
async function exportDocx(name: string) {
  if (!ready.value || !instance) throw new Error("编辑器尚未就绪");
  const blob = await instance.command.executeExportDocx({ fileName: name.replace(/\.docx$/i, "") });
  return { blob, downloadStarted: true };
}
defineExpose<WordEditorHandle>({ insertVariable, exportDocx });
</script>

<style scoped>
.canvas-host {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.canvas-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color);
}
.canvas-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: var(--el-fill-color);
}
</style>
