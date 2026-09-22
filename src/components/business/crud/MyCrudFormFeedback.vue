<template>
  <div class="crud-feedback">
    <MyFeedback
      v-if="
        controller.draft &&
        (!layout ||
          !['idle', 'saving', 'saved'].includes(controller.draft.state.phase) ||
          controller.draft.state.memoryOnly)
      "
      class="crud-form__draft"
      :message="draftMessage"
      :tone="draftTone"
      :next-step="draftNextStep"
    >
      <small v-if="controller.draft.state.updatedAt">
        {{ new Date(controller.draft.state.updatedAt).toLocaleTimeString() }}
      </small>
      <el-button
        v-if="controller.draft.state.phase === 'available'"
        type="warning"
        :disabled="busy || controller.childrenReady === false"
        @click="controller.draft.restore()"
      >
        恢复草稿
      </el-button>
      <el-button
        v-if="['available', 'conflict'].includes(controller.draft.state.phase)"
        :disabled="busy"
        @click="controller.draft.discard()"
      >
        丢弃旧草稿
      </el-button>
      <el-button
        v-if="controller.draft.state.phase === 'error'"
        :disabled="busy"
        @click="controller.draft.retry()"
      >
        重试草稿操作
      </el-button>
      <el-button
        v-if="['available', 'conflict', 'unsafe'].includes(controller.draft.state.phase)"
        @click="
          draftPreview = controller.draft.inspect();
          previewOpen = true;
        "
      >
        查看旧草稿
      </el-button>
      <span v-if="controller.draft.state.memoryOnly">仅内存保留，刷新后可能丢失</span>
    </MyFeedback>
    <MyFeedback
      v-if="controller.state.error"
      :message="controller.state.error"
      :tone="
        controller.state.mutationOutcome === 'committed' ||
        controller.state.mutationOutcome === 'unknown'
          ? 'warning'
          : 'error'
      "
      :next-step="nextStep"
    >
      <el-button v-if="controller.state.phase === 'load-error'" @click="controller.open(target)">
        重新加载
      </el-button>
      <el-button
        v-if="controller.state.phase === 'committed-needs-sync'"
        type="primary"
        @click="controller.retrySync"
      >
        重试回填
      </el-button>
    </MyFeedback>
    <MyFeedback v-if="readonlyReason" :message="readonlyReason" />
    <section v-if="controller.state.issues.length" class="crud-issues" aria-label="表单错误汇总">
      <MyFeedback
        :message="`有 ${controller.state.issues.length} 项需要修正，点击可定位`"
        tone="error"
        next-step="修改后请重新保存，以完整校验结果为准。"
      >
        <ul>
          <li v-for="(issue, index) in controller.state.issues" :key="index">
            <button
              v-if="issue.field || issue.section"
              type="button"
              @click="controller.focusIssue(issue)"
            >
              {{ issueLabel(issue) }}{{ issue.message }}
            </button>
            <span v-else>{{ issue.message }}</span>
          </li>
        </ul>
      </MyFeedback>
    </section>
    <MyFeedback
      v-if="controller.childrenReady === false"
      message="子表正在准备，完成后可保存或恢复草稿。"
    />
    <MyFeedback v-if="changeError" :message="changeError" tone="error">
      <el-button v-if="retryChange" :disabled="changePending" @click="retryChange">
        重新处理字段变化
      </el-button>
    </MyFeedback>
    <MyDialog
      v-model="previewOpen"
      title="本机草稿内容（只读）"
      width="min(760px, 92vw)"
      @closed="draftPreview = ''"
    >
      <pre class="crud-form__draft-preview">{{ draftPreview }}</pre>
      <template #footer><el-button @click="previewOpen = false">关闭</el-button></template>
    </MyDialog>
  </div>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number, C">
import { computed, ref, type DeepReadonly } from "vue";
import { cloneReadonlyModel } from "../fields/model";
import type { CrudTarget, CrudIssue } from "./types";
import MyDialog from "@/components/common/MyDialog.vue";
import type { CrudFormProps } from "./form-presentation";
import MyFeedback from "../feedback/MyFeedback.vue";
import { feedbackConfig } from "@/config/feedback";
defineOptions({ inheritAttrs: false });
const props = defineProps<
  Pick<
    CrudFormProps<Model, Entity, Id, C>,
    "controller" | "readonlyReason" | "changePending" | "changeError" | "retryChange" | "layout"
  > &
    Partial<Pick<CrudFormProps<Model, Entity, Id, C>, "fields" | "sections">>
>();
function issueLabel(issue: DeepReadonly<CrudIssue<Model>>) {
  const label = issue.section
    ? props.sections?.find((section) => section.key === issue.section)?.label
    : props.fields?.find((field) => field.key === issue.field)?.label;
  return label ? `${label}：` : "";
}
const target = computed(() => cloneReadonlyModel<CrudTarget<Id>>(props.controller.state.target));
const previewOpen = ref(false);
const draftPreview = ref("");
const busy = computed(() => props.controller.busy);
const readonlyReason = computed(() => props.readonlyReason ?? props.controller.readonlyReason);
const draftMessage = computed(() => props.controller.draft?.state.message || "已启用本机草稿保护");
const draftTone = computed(() => {
  const phase = props.controller.draft?.state.phase;
  return phase === "error"
    ? "error"
    : phase === "available" || phase === "conflict" || phase === "unsafe"
      ? "warning"
      : "info";
});
const draftNextStep = computed(() => {
  const phase = props.controller.draft?.state.phase;
  if (phase === "available") return "可恢复旧草稿，也可先查看内容。";
  if (phase === "conflict") return "请先查看旧草稿；确认不再需要时再丢弃。";
  if (phase === "unsafe") return "请先核实提交结果，再继续处理。";
  return undefined;
});
const nextStep = computed(() => {
  const state = props.controller.state;
  if (state.mutationOutcome === "unknown") return feedbackConfig.messages.unknown;
  if (state.phase === "committed-needs-sync") return feedbackConfig.messages.committed;
  if (state.phase === "saved" && state.error) return feedbackConfig.messages.postSave;
  if (state.phase === "load-error") return "可以重新加载；尚未提交任何修改。";
  return undefined;
});
</script>
<style scoped lang="scss">
.crud-feedback {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.crud-feedback:empty {
  display: none;
}
.crud-issues ul {
  width: 100%;
  margin: 0;
  padding-left: 20px;
  max-height: 180px;
  overflow: auto;
}
.crud-issues li + li {
  margin-top: 6px;
}
.crud-issues button {
  padding: 2px 0;
  border: 0;
  color: var(--el-color-danger);
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.crud-issues button:hover {
  text-decoration: underline;
}
.crud-issues button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.crud-form__draft small {
  color: var(--el-text-color-secondary);
}

.crud-form__draft-preview {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 60vh;
  overflow: auto;
}
</style>
