<template>
  <div class="batch-actions">
    <span class="batch-actions__scope" role="status">{{ controller.scopeLabel }}</span>
    <template v-for="button in controller.buttons" :key="button.key">
      <ActionButton
        v-if="button.visible"
        :label="button.label"
        :tone="button.tone"
        :link="true"
        :icon="button.icon ?? (button.tone === 'danger' ? Delete : Operation)"
        :disabled="controller.busy"
        :disabled-reason="button.reason"
        @click="run(button.key)"
      />
    </template>
    <el-button
      v-if="controller.result || controller.error"
      :icon="Document"
      link
      @click="feedbackOpen = true"
    >
      查看批量结果
    </el-button>
    <MyDialog v-model="feedbackOpen" title="批量操作结果" :show-confirm="false" cancel-text="关闭">
      <MyFeedback v-if="controller.error" :message="controller.error" tone="error" />
      <template v-if="controller.result">
        <MyFeedback
          :message="`匹配 ${controller.result.matched} 条，成功 ${controller.result.succeeded} 条，失败 ${controller.result.failed} 条`"
          :tone="controller.result.failed ? 'warning' : 'success'"
          :next-step="
            controller.result.failed ? '请核对未完成项；已完成项无需重复处理。' : undefined
          "
        />
        <p>请求编号：{{ controller.result.requestId }}</p>
        <p v-for="(failure, index) in controller.result.failures" :key="index">
          {{ failure.key }}：{{ failure.message }}
        </p>
        <p v-if="controller.result.failed > controller.result.failures.length">
          仅展示部分失败原因，请通过请求编号查询完整结果。
        </p>
      </template>
    </MyDialog>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { Delete, Operation, Document } from "@element-plus/icons-vue";
import ActionButton from "@/components/business/ActionButton.vue";
import MyDialog from "@/components/common/MyDialog.vue";
import MyFeedback from "../feedback/MyFeedback.vue";
import type { BatchController } from "./batch";
const props = defineProps<{
  /** useBatchActions 返回的页面级控制器；组件不直接调用接口。 */
  controller: BatchController;
}>();
/** 控制批量执行结果窗口，让用户查看各条记录的成功或失败原因。 */
const feedbackOpen = ref(false);
/** 执行并打开持久反馈面板；取消确认且无结果时不弹空面板。 */
async function run(key: string) {
  const previous = props.controller.result;
  await props.controller.run(key);
  if ((props.controller.result && props.controller.result !== previous) || props.controller.error)
    feedbackOpen.value = true;
}
</script>
<style scoped>
.batch-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.batch-actions__scope {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
