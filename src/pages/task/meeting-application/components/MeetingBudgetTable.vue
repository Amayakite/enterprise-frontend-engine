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
    :summary="{ scope: 'all', text: `¥${total}` }"
    :loading="loading"
    @selection-change="selectedIds = $event.keys"
    @row-patch="patchRow"
  >
    <template #title><strong>费用预算</strong></template>
    <template #toolbar>
      <el-button type="primary" :disabled="loading" @click="addRow">增行</el-button>
      <el-button :disabled="loading || !selectedIds.length" @click="removeSelected">删行</el-button>
    </template>
  </MyTable>
</template>

<script setup lang="ts">
import { feedback } from "@/utils/feedback";
import type { MeetingBudgetItem } from "@/api/task/meeting-application/types";
import { defineFields } from "@/components/business/fields/normalize";
import MyTable from "@/components/table/MyTable.vue";
import type { MyTableExpose } from "@/components/table/types";
import { sumDecimals, toFixedDecimal } from "@/utils/decimal";

defineProps<{ loading?: boolean }>();
const model = defineModel<MeetingBudgetItem[]>({ required: true });
const tableContext = {};
const selectedIds = ref<string[]>([]);
const tableRef = ref<MyTableExpose<MeetingBudgetItem, string>>();
const fields = defineFields<MeetingBudgetItem, typeof tableContext>()([
  {
    key: "budgetType",
    label: "费用类型",
    type: "dict",
    emptyValue: "",
    dict: { code: "pilot_budget_type", valueType: "string" },
    form: { required: true },
    table: { minWidth: 140 },
  },
  {
    key: "estimatedAmount",
    label: "预估金额（元）",
    type: "amount",
    form: { required: true },
    table: { width: 145, align: "right" },
    props: { placeholder: "0.00" },
  },
  {
    key: "remark",
    label: "费用说明",
    type: "text",
    form: {},
    table: { minWidth: 220 },
    props: { maxlength: 100 },
  },
]);
const total = computed(() =>
  toFixedDecimal(sumDecimals(model.value.map((row) => row.estimatedAmount || "0")))
);

function createRow(): MeetingBudgetItem {
  return { id: `budget-${crypto.randomUUID()}`, budgetType: "", estimatedAmount: "", remark: "" };
}
async function addRow() {
  const row = createRow();
  model.value = [...model.value, row];
  await nextTick();
  await tableRef.value?.startEdit(row.id, "budgetType");
}
function removeSelected() {
  model.value = model.value.filter((row) => !selectedIds.value.includes(row.id));
  selectedIds.value = [];
}
function patchRow(event: { rowKey: string; changes: Partial<MeetingBudgetItem> }) {
  model.value = model.value.map((row) =>
    row.id === event.rowKey ? { ...row, ...event.changes } : row
  );
}
async function commitAndValidate() {
  if (!(await tableRef.value?.commitEdit())) return false;
  if (!model.value.length) {
    feedback.warning("请至少填写一条费用预算");
    return false;
  }
  const result = await tableRef.value?.validate(model.value);
  return !!result?.valid;
}
defineExpose({ commitAndValidate, total });
</script>
