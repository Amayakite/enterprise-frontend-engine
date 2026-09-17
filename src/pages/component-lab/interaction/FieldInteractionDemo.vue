<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center flex-wrap gap-3">
      <el-switch v-model="locked" active-text="只读" />
      <el-radio-group v-model="density" aria-label="字段密度">
        <el-radio-button value="compact">紧凑</el-radio-button>
        <el-radio-button value="comfortable">舒适</el-radio-button>
      </el-radio-group>
      <ActionButton label="验证主表" tone="primary" :link="false" @click="validateMain" />
      <ActionButton label="验证全部明细并定位" tone="primary" :link="false" @click="validateAll" />
      <ActionButton label="重置样例" :link="false" @click="reset" />
    </div>
    <el-alert
      v-if="message"
      :title="message"
      :type="valid ? 'success' : 'error'"
      :closable="false"
    />
    <MyForm
      ref="mainForm"
      v-model="main"
      :fields="fields"
      :context="context"
      :create-initial-model="createLine"
      :readonly="locked"
      :density="density"
      :columns="2"
    />
    <el-divider>随主表保存的明细 · 共 {{ lines.length }} 行</el-divider>
    <MyTable
      :key="generation"
      ref="table"
      :rows="visibleRows"
      :fields="fields"
      :get-row-key="(row) => row.id"
      :context="context"
      :height="420"
      :density="density"
      module-key="contacts"
      :edit="locked ? false : { createInitialRow: createLine, allowAdd: true, allowRemove: true }"
      :pagination="{ pageNum: page, pageSize: limit, total: lines.length }"
      :before-locate="locate"
      @row-add="add"
      @row-remove="remove"
      @row-patch="patch"
      @page-change="pageChange"
    >
      <template #title>
        <el-text>姓名必填；邮箱按行条件校验；第 12 行预置了错误邮箱。</el-text>
      </template>
    </MyTable>
    <details>
      <summary>查看同字段的只读展示</summary>
      <MyDesc :model-value="main" :fields="fields" :context="context" :density="density" />
    </details>
  </div>
</template>
<script setup lang="ts">
import MyForm from "@/components/business/MyForm/index.vue";
import MyDesc from "@/components/business/MyDesc.vue";
import MyTable from "@/components/table/MyTable.vue";
import ActionButton from "@/components/business/ActionButton.vue";
import { defineFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldDensity, MyFormExpose } from "@/components/business/fields/types";
import type { MyTableExpose } from "@/components/table/types";
import { createGeographyReference } from "@/api/master-data/reference";
import { customerSource } from "@/pages/component-lab/reference/references";
interface Line {
  id: string;
  name: string;
  email: string;
  requireEmail: boolean;
  note: string;
  provinceId: string | null;
  customerIds: number[];
  category: "normal" | "important";
}
interface Context {
  readonly: boolean;
}
function createLine(): Line {
  return {
    id: crypto.randomUUID(),
    name: "",
    email: "",
    requireEmail: false,
    note: "",
    provinceId: null,
    customerIds: [],
    category: "normal",
  };
}
function seeds() {
  return Array.from({ length: 12 }, (_, index) => ({
    ...createLine(),
    name: `联系人 ${index + 1}`,
    email: index === 11 ? "wrong-email" : "",
    note:
      index === 0
        ? "多行说明第一行\n第二行：公共表格负责输入和错误的完整高度\n第三行：无需页面覆盖 VXE 样式"
        : "",
  }));
}
const locked = ref(false),
  density = ref<FieldDensity>("compact"),
  generation = ref(0);
const context = computed<Context>(() => ({ readonly: locked.value }));
const main = ref<Line>({ ...createLine(), name: "主表联系人" });
const lines = ref<Line[]>(seeds()),
  page = ref(1),
  limit = ref(3);
const message = ref(""),
  valid = ref(false);
const mainForm = ref<MyFormExpose<Line>>(),
  table = ref<MyTableExpose<Line, string>>();
const reference = createReferenceField<Line, Context>();
const province = createGeographyReference("省份");
const fields = defineFields<Line, Context>()([
  {
    key: "name",
    label: "姓名",
    type: "text",
    placeholder: "例如 张三",
    form: { required: true },
    detail: true,
    table: { minWidth: 170 },
  },
  {
    key: "email",
    label: "邮箱",
    type: "text",
    formatHint: "email",
    help: "选填；勾选“必须邮箱”后必填",
    form: { required: ({ model }) => model.requireEmail },
    detail: true,
    table: { minWidth: 260 },
  },
  {
    key: "requireEmail",
    label: "必须邮箱",
    type: "switch",
    form: {},
    detail: true,
    table: { width: 115 },
  },
  {
    key: "category",
    label: "联系人类型",
    type: "select",
    options: [
      { label: "普通", value: "normal" },
      { label: "重点", value: "important" },
    ],
    form: {},
    detail: true,
    table: { minWidth: 130 },
  },
  {
    key: "provinceId",
    label: "省份",
    type: "reference",
    placeholder: "按名称或地区编码查询",
    help: "打开选择按钮可进行多字段与高级查询",
    readonlyReason: () => "当前以只读方式展示",
    form: {},
    detail: true,
    table: { minWidth: 240 },
    reference: reference({
      source: province,
      filters: () => ({ organizationId: "org-a", level: "province", parentId: null }) as const,
      scopeKey: () => "org-a:province",
    }),
  },
  {
    key: "customerIds",
    label: "关联客户（多选）",
    type: "reference",
    form: {},
    detail: true,
    table: { minWidth: 250 },
    reference: reference({
      source: customerSource,
      multiple: true,
      filters: () => ({ organizationId: "org-a" }) as const,
      scopeKey: () => "org-a",
    }),
  },
  {
    key: "note",
    label: "说明",
    type: "textarea",
    props: { rows: 3 },
    placeholder: "填写多行备注",
    form: { span: 2 },
    detail: { span: 2 },
    table: { minWidth: 260 },
  },
]);
const visibleRows = computed(() =>
  lines.value.slice((page.value - 1) * limit.value, page.value * limit.value)
);
function add(row: Line) {
  lines.value = [...lines.value, row];
  page.value = Math.ceil(lines.value.length / limit.value);
}
function remove(key: string) {
  lines.value = lines.value.filter((row) => row.id !== key);
  page.value = Math.max(1, Math.min(page.value, Math.ceil(lines.value.length / limit.value)));
}
function patch(event: { rowKey: string; changes: Partial<Line> }) {
  lines.value = lines.value.map((row) =>
    row.id === event.rowKey ? { ...row, ...event.changes } : row
  );
}
function pageChange(value: { pageNum: number; pageSize: number }) {
  page.value = value.pageNum;
  limit.value = value.pageSize;
}
async function locate(key: string) {
  const index = lines.value.findIndex((row) => row.id === key);
  if (index >= 0) page.value = Math.floor(index / limit.value) + 1;
  await nextTick();
}
async function validateMain() {
  const result = await mainForm.value!.validate();
  valid.value = result.valid;
  message.value = result.valid
    ? "主表校验通过：选填邮箱为空可通过"
    : result.errors.map((item) => item.message).join("；");
  if (result.errors[0]) mainForm.value?.focusField(result.errors[0].field);
}
async function validateAll() {
  if (!(await table.value!.commitEdit())) {
    valid.value = false;
    message.value = "请先修正当前行草稿";
    return;
  }
  const result = await table.value!.validate(lines.value);
  valid.value = result.valid;
  message.value = result.valid
    ? `全部 ${lines.value.length} 行校验通过`
    : result.errors
        .map(
          (item) =>
            `${item.moduleKey} · 第 ${lines.value.findIndex((row) => row.id === item.rowKey) + 1} 行 · ${item.field}：${item.message}`
        )
        .join("；");
  const first = result.errors[0];
  if (first) {
    await table.value!.focusCell(first.rowKey, first.field);
    if (!locked.value) await table.value!.startEdit(first.rowKey, first.field);
  }
}
function reset() {
  table.value?.cancelEdit();
  lines.value = seeds();
  main.value = { ...createLine(), name: "主表联系人" };
  page.value = 1;
  message.value = "";
  generation.value++;
}
</script>
