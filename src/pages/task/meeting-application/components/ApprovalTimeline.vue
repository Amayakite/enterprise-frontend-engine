<template>
  <el-timeline v-if="items.length">
    <el-timeline-item
      v-for="item in items"
      :key="item.id"
      :timestamp="item.operatedAt"
      :type="typeOf(item.result)"
      placement="top"
    >
      <strong>{{ item.nodeName }}</strong>
      <p>{{ item.operatorName }} · {{ resultText(item.result) }}</p>
      <p v-if="item.comment" class="timeline-comment">{{ item.comment }}</p>
    </el-timeline-item>
  </el-timeline>
  <el-empty v-else description="暂无审批记录" :image-size="64" />
</template>

<script setup lang="ts">
import type { ApprovalTimelineItem } from "@/api/task/meeting-application/types";
defineProps<{ items: readonly ApprovalTimelineItem[] }>();
function typeOf(result: ApprovalTimelineItem["result"]) {
  if (result === "approved") return "success" as const;
  if (result === "rejected") return "danger" as const;
  if (result === "pending") return "warning" as const;
  return "primary" as const;
}
function resultText(result: ApprovalTimelineItem["result"]) {
  return { created: "已创建", pending: "处理中", approved: "已同意", rejected: "已驳回" }[result];
}
</script>

<style scoped lang="scss">
p {
  margin: 6px 0 0;
}
.timeline-comment {
  color: var(--el-text-color-secondary);
}
</style>

