<template>
  <MyTable
    :rows="model"
    :fields="fields"
    :context="tableContext"
    :get-row-key="(row) => row.id"
    :height="280"
    :selection="{ mode: 'multiple', keys: selectedIds }"
    :loading="loading"
    @selection-change="selectedIds = $event.keys"
  >
    <template #title><strong>参会人员</strong></template>
    <template #toolbar>
      <MyReference
        ref="referenceRef"
        :model-value="candidateIds"
        :source="attendeeReference"
        :filters="filters"
        :scope-key="scopeKey"
        multiple
        :max-selected="50"
        :before-open="beforeOpen"
        placeholder="选择参会人员"
        @commit="applyCandidates"
      />
      <el-button :disabled="loading || !selectedIds.length" @click="removeSelected">移除</el-button>
    </template>
  </MyTable>
</template>

<script setup lang="ts">
import { feedback } from "@/utils/feedback";
import type { AttendeeCandidate, OrganizationScope } from "@/api/master-data/types";
import type { MeetingAttendeeItem } from "@/api/task/meeting-application/types";
import MyReference from "@/components/business/MyReference/index.vue";
import type { ReferenceCommit, ReferenceExpose } from "@/components/business/MyReference/types";
import { defineFields } from "@/components/business/fields/normalize";
import MyTable from "@/components/table/MyTable.vue";
import { attendeeReference } from "../references";

const props = defineProps<{
  organizationId: OrganizationScope;
  targetId: string | null;
  serviceItemId: string | null;
  loading?: boolean;
}>();
const model = defineModel<MeetingAttendeeItem[]>({ required: true });
const selectedIds = ref<string[]>([]);
const referenceRef = ref<ReferenceExpose>();
const tableContext = {};
const candidateIds = computed(() =>
  model.value.flatMap((row) => (row.candidateId ? [row.candidateId] : []))
);
const filters = computed(() => ({
  organizationId: props.organizationId,
  targetId: props.targetId,
  serviceItemId: props.serviceItemId,
}));
const scopeKey = computed(
  () => `${props.organizationId}:${props.targetId ?? "none"}:${props.serviceItemId ?? "none"}`
);
const fields = defineFields<MeetingAttendeeItem, typeof tableContext>()([
  { key: "name", label: "姓名", type: "text", table: { minWidth: 130 } },
  { key: "mobile", label: "手机号", type: "text", table: { width: 135 } },
  {
    key: "checkinStatus",
    label: "签到状态",
    type: "dict",
    emptyValue: "pending",
    dict: { code: "pilot_attendee_status", valueType: "string" },
    table: { width: 105 },
  },
  { key: "checkinTime", label: "签到时间", type: "text", table: { width: 165 } },
  { key: "feedback", label: "反馈", type: "text", table: { minWidth: 160 } },
]);

function beforeOpen() {
  return {
    allowed: !!props.targetId && !!props.serviceItemId,
    reason: props.targetId && props.serviceItemId ? undefined : "请先选择服务项目和网点/商业",
  };
}
function applyCandidates(event: ReferenceCommit<AttendeeCandidate, string, true>) {
  const previous = new Map(
    model.value.flatMap((row) => (row.candidateId ? [[row.candidateId, row] as const] : []))
  );
  model.value = event.items.map((item) => {
    const existing = previous.get(item.id);
    return (
      existing ?? {
        id: `attendee-${crypto.randomUUID()}`,
        candidateId: item.id,
        name: item.name,
        mobile: item.mobile,
        checkinStatus: "pending",
        checkinTime: "",
        feedback: "",
      }
    );
  });
  selectedIds.value = [];
}
function removeSelected() {
  model.value = model.value.filter((row) => !selectedIds.value.includes(row.id));
  selectedIds.value = [];
}
async function commitAndValidate() {
  if (!model.value.length) {
    feedback.warning("请至少选择一名参会人员");
    return false;
  }
  const keys = model.value.map((row) => row.candidateId ?? `${row.name}:${row.mobile}`);
  if (new Set(keys).size !== keys.length) {
    feedback.warning("参会人员不能重复");
    return false;
  }
  const availability = await referenceRef.value?.validateSelection();
  if (!availability?.allowed) {
    feedback.warning(availability?.reason ?? "参会人员已失效，请重新选择");
    return false;
  }
  return true;
}
defineExpose({ commitAndValidate });
</script>

<style scoped lang="scss">
:deep(.my-reference) {
  width: min(360px, 48vw);
}
</style>
