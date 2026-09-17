<template>
  <MyTable
    ref="tableRef"
    :rows="model"
    :fields="fields"
    :context="tableContext"
    :get-row-key="(row) => row.id"
    :height="280"
    :selection="{ mode: 'multiple', keys: selectedIds }"
    :edit="{ createInitialRow: createRow }"
    :loading="loading"
    @selection-change="selectedIds = $event.keys"
    @row-patch="patchRow"
  >
    <template #title><strong>会议议程</strong></template>
    <template #toolbar>
      <el-button type="primary" :disabled="loading" @click="addRow">增行</el-button>
      <el-button :disabled="loading || !selectedIds.length" @click="removeSelected">删行</el-button>
    </template>
  </MyTable>
</template>

<script setup lang="ts">
import type { MeetingAgendaItem } from "@/api/task/meeting-application/types";
import { defineFields } from "@/components/business/fields/normalize";
import MyTable from "@/components/table/MyTable.vue";
import type { MyTableExpose } from "@/components/table/types";

defineProps<{ loading?: boolean }>();
const model = defineModel<MeetingAgendaItem[]>({ required: true });
const selectedIds = ref<string[]>([]);
const tableContext = {};
const tableRef = ref<MyTableExpose<MeetingAgendaItem, string>>();
const timeRule = {
  pattern: /^([01]\d|2[0-3]):[0-5]\d$/,
  message: "请输入 HH:mm 格式时间",
  trigger: "blur",
};
const fields = defineFields<MeetingAgendaItem, typeof tableContext>()([
  {
    key: "startTime",
    label: "开始时间",
    type: "text",
    form: { required: true, rules: timeRule },
    table: { width: 120 },
    props: { placeholder: "14:00" },
  },
  {
    key: "endTime",
    label: "结束时间",
    type: "text",
    form: { required: true, rules: timeRule },
    table: { width: 120 },
    props: { placeholder: "15:00" },
  },
  {
    key: "subject",
    label: "议程主题",
    type: "text",
    form: { required: true },
    table: { minWidth: 220 },
    props: { maxlength: 100 },
  },
  {
    key: "speaker",
    label: "讲者",
    type: "text",
    form: {},
    table: { minWidth: 140 },
    props: { maxlength: 50 },
  },
]);

function createRow(): MeetingAgendaItem {
  return {
    id: `agenda-${crypto.randomUUID()}`,
    startTime: "",
    endTime: "",
    subject: "",
    speaker: "",
  };
}
async function addRow() {
  const row = createRow();
  model.value = [...model.value, row];
  await nextTick();
  await tableRef.value?.startEdit(row.id, "startTime");
}
function removeSelected() {
  model.value = model.value.filter((row) => !selectedIds.value.includes(row.id));
  selectedIds.value = [];
}
function patchRow(event: { rowKey: string; changes: Partial<MeetingAgendaItem> }) {
  model.value = model.value.map((row) =>
    row.id === event.rowKey ? { ...row, ...event.changes } : row
  );
}
async function commitAndValidate() {
  if (!(await tableRef.value?.commitEdit())) return false;
  const validated = await tableRef.value?.validate(model.value);
  if (!validated?.valid) return false;
  if (model.value.some((row) => row.startTime >= row.endTime)) {
    ElMessage.warning("会议议程的结束时间必须晚于开始时间");
    return false;
  }
  return true;
}
defineExpose({ commitAndValidate });
</script>

