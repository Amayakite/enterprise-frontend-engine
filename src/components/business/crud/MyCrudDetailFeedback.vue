<template>
  <div class="detail-feedback">
    <MyFeedback
      v-if="controller.state.error || controller.actionError"
      :message="controller.state.error || controller.actionError || ''"
      :tone="controller.actionResult ? 'warning' : 'error'"
    />
    <MyFeedback
      v-if="controller.actionResult && !controller.actionError && !controller.state.error"
      :message="
        [
          controller.actionResult.message,
          `已完成 ${controller.actionResult.affectedKeys.length} 项`,
          ...(controller.actionResult.failed ?? []).map((item) => `${item.key}：${item.message}`),
        ]
          .filter(Boolean)
          .join('；')
      "
      :tone="controller.actionResult.failed?.length ? 'warning' : 'success'"
      :next-step="
        controller.actionResult.failed?.length
          ? '请核对未完成项，已完成项无需重复处理。'
          : undefined
      "
    />
    <el-skeleton v-if="controller.state.phase === 'loading'" animated :rows="6" />
  </div>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number">
import type { CrudDetailProps } from "./form-presentation";
import MyFeedback from "../feedback/MyFeedback.vue";
defineProps<Pick<CrudDetailProps<Model, Entity, Id, unknown>, "controller">>();
</script>
<style scoped>
.detail-feedback {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-feedback:empty {
  display: none;
}
</style>
