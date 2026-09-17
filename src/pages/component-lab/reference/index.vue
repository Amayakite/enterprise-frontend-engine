<template>
  <div class="page-container reference-lab">
    <ReferenceNavigationDemo />
    <ReferenceDependenciesDemo />
    <MultipleReferenceDemo />
    <SingleReferenceDemo />
    <el-card shadow="never">
      <h1>M0 合同与内核实验</h1>
      <p class="text-sm">
        仅开发模式可访问。验证 VXE 表格、泛型模型与 Mock 合同；单选参照见上方 M1 场景。
      </p>
      <div class="lab-controls">
        <el-select
          v-model="organizationId"
          aria-label="组织"
          class="lab-select"
          @change="resetQuery"
        >
          <el-option label="组织 A" value="org-a" />
          <el-option label="组织 B" value="org-b" />
        </el-select>
        <el-input
          v-model="keyword"
          aria-label="查询关键字"
          placeholder="客户名称或编码"
          clearable
          @keyup.enter="resetQuery"
        />
        <el-select v-model="delayMs" aria-label="请求延迟" class="lab-select">
          <el-option
            v-for="delay in [50, 300, 1500]"
            :key="delay"
            :label="`${delay}ms`"
            :value="delay"
          />
        </el-select>
        <el-checkbox v-model="fail">主动失败</el-checkbox>
        <el-checkbox v-model="empty">空结果</el-checkbox>
        <el-button type="primary" :loading="loading" @click="resetQuery">查询客户</el-button>
        <el-button @click="verifyResolve">验证批量回显</el-button>
      </div>
      <div class="flex flex-wrap gap-4 mt-3 text-sm">
        <ReferenceTypeProbe
          v-model="singleId"
          :source="customerSource"
          :filters="filters"
          :scope-key="scopeKey"
        />
        <ReferenceTypeProbe
          v-model="multipleIds"
          multiple
          :source="productSource"
          :filters="filters"
          :scope-key="scopeKey"
        />
      </div>
      <p role="status" data-testid="resolve-result">{{ resolveResult }}</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
    </el-card>

    <el-card class="lab-table-card" shadow="never">
      <div class="page-toolbar">
        <div class="page-toolbar__left">
          <el-button @click="reverseRows">倒序当前页</el-button>
          <el-button @click="addDraftRow">追加未保存行</el-button>
          <el-button @click="duplicate = !duplicate">
            {{ duplicate ? "恢复合法行键" : "注入重复行键" }}
          </el-button>
        </div>
        <span data-testid="row-event" class="text-sm">{{ rowEvent }}</span>
      </div>
      <TableView
        :rows="displayRows"
        :columns="columns"
        :get-row-key="getRowKey"
        :loading="loading"
        :height="360"
        @row-click="onRowClick"
      >
        <template #column-active="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'">
            {{ row.active ? "启用" : "停用" }}
          </el-tag>
        </template>
        <template #column-note="{ row, rowKey }">
          <el-input
            :model-value="drafts.get(rowKey) ?? row.note"
            :aria-label="`备注 ${row.code}`"
            @update:model-value="drafts.set(rowKey, $event)"
          />
        </template>
        <template #column-action="{ row, rowKey }">
          <el-button
            type="primary"
            link
            :aria-label="`弹层探针 ${row.code}`"
            @click.stop="openProbe(rowKey, $event)"
          >
            弹层探针
          </el-button>
        </template>
      </TableView>
      <Pagination
        :total="total"
        v-model:page="pageNum"
        v-model:limit="pageSize"
        @pagination="loadCustomers"
      />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="行内编辑探针"
      width="min(720px, calc(100vw - 32px))"
      append-to-body
      @closed="restoreTrigger"
    >
      <p>
        活动行键：
        <strong data-testid="active-row-key">{{ activeKeyLabel }}</strong>
        。本探针只修改页面草稿，不写入表格 props。
      </p>
      <el-input v-model="dialogNote" aria-label="弹窗备注" />
      <div class="mt-4 flex gap-2">
        <el-button @click="nestedVisible = true">打开嵌套对话框</el-button>
        <el-select v-model="probeOption" aria-label="弹层下拉" placeholder="验证下拉层级">
          <el-option label="选项一" value="one" />
          <el-option label="选项二" value="two" />
        </el-select>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消探针</el-button>
        <el-button type="primary" @click="confirmProbe">确认草稿</el-button>
      </template>
      <el-dialog
        v-model="nestedVisible"
        title="嵌套焦点探针"
        width="min(480px, calc(100vw - 32px))"
        append-to-body
      >
        <el-input aria-label="嵌套输入" placeholder="按 Esc 只关闭本层" />
        <template #footer>
          <el-button @click="nestedVisible = false">关闭嵌套层</el-button>
        </template>
      </el-dialog>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import ReferenceNavigationDemo from "./ReferenceNavigationDemo.vue";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import TableView from "@/components/table/TableView.vue";
import Pagination from "@/components/common/Pagination.vue";
import ReferenceDependenciesDemo from "./ReferenceDependenciesDemo.vue";
import MultipleReferenceDemo from "./MultipleReferenceDemo.vue";
import SingleReferenceDemo from "./SingleReferenceDemo.vue";
import ReferenceTypeProbe from "./ReferenceTypeProbe.vue";
import { customerSource, productSource } from "./references";
import { CustomerLabAPI, ContactLabAPI, ProductLabAPI } from "@/api/reference-lab";
import type { Customer, LabControls, OrganizationId } from "@/api/reference-lab/types";
import type { TableViewColumn, TableViewRowEvent } from "@/components/table/types";

defineOptions({ name: "ReferenceLab" });
type RowKey = string | number;
type LabRow = Customer & { clientKey: RowKey; note: string; action: string };
const rows = ref<LabRow[]>([]);
const columns: TableViewColumn<LabRow>[] = [
  { key: "code", label: "客户编码（固定）", width: 160, fixed: "left" },
  { key: "name", label: "客户名称", width: 340 },
  { key: "region", label: "地区", width: 180 },
  { key: "active", label: "状态插槽", width: 100 },
  { key: "note", label: "输入插槽", width: 280 },
  { key: "action", label: "操作（固定）", width: 130, fixed: "right" },
];
const organizationId = ref<OrganizationId>("org-a");
const filters = computed(() => ({ organizationId: organizationId.value }));
const scopeKey = computed(() => `lab:user-a:${organizationId.value}:permission-v1`);
const singleId = ref<number | null>(0);
const multipleIds = ref<string[]>(["0"]);
const keyword = ref("");
const pageNum = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const error = ref("");
const delayMs = ref<LabControls["delayMs"]>(50);
const fail = ref(false);
const empty = ref(false);
const duplicate = ref(false);
const rowEvent = ref("点击单元格查看业务行键");
const resolveResult = ref("回显测试包含 ID 0、停用 16、缺失 9999 和越界 1。");
const drafts = reactive(new Map<RowKey, string>());
const displayRows = computed(() =>
  duplicate.value && rows.value[0] ? [...rows.value, { ...rows.value[0] }] : rows.value
);
const getRowKey = (row: Readonly<LabRow>) => row.clientKey;
const controls = (): LabControls => ({
  delayMs: delayMs.value,
  fail: fail.value,
  empty: empty.value,
});
let requestVersion = 0;
let disposed = false;

async function loadCustomers() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = "";
  try {
    const data = await CustomerLabAPI.search(
      {
        keyword: keyword.value,
        filters: filters.value,
        conditions: [],
        pageNum: pageNum.value,
        pageSize: pageSize.value,
        purpose: "dialog",
      },
      { signal: new AbortController().signal },
      controls()
    );
    if (disposed || version !== requestVersion) return;
    rows.value = data.list.map((row) => ({
      ...row,
      clientKey: row.id === 0 ? 0 : row.id === 2 ? 1 : row.id === 4 ? "1" : `customer-${row.id}`,
      note: "",
      action: "",
    }));
    total.value = data.total;
    duplicate.value = false;
  } catch (caught) {
    if (!disposed && version === requestVersion)
      error.value = caught instanceof Error ? caught.message : "请求失败";
  } finally {
    if (!disposed && version === requestVersion) loading.value = false;
  }
}
function resetQuery() {
  pageNum.value = 1;
  drafts.clear();
  dialogVisible.value = false;
  nestedVisible.value = false;
  void loadCustomers();
}
async function verifyResolve() {
  const currentScope = scopeKey.value;
  const context = { signal: new AbortController().signal };
  try {
    const [customer, contact, product] = await Promise.all([
      CustomerLabAPI.resolve([0, 16, 9999, 1], filters.value, context, controls()),
      ContactLabAPI.resolve(
        ["contact-0", "contact-1"],
        { ...filters.value, customerId: 0 },
        context,
        controls()
      ),
      ProductLabAPI.resolve(["0", "product-16", "missing"], filters.value, context, controls()),
    ]);
    if (disposed || currentScope !== scopeKey.value) return;
    resolveResult.value = `客户可用 ${JSON.stringify(customer.items.map((row) => row.id))} / 不可用 ${JSON.stringify(customer.unavailableIds)}；联系人可用 ${contact.items.length}；商品可用 ${JSON.stringify(product.items.map((row) => row.id))}`;
  } catch (caught) {
    if (!disposed && currentScope === scopeKey.value)
      resolveResult.value = caught instanceof Error ? caught.message : "回显失败";
  }
}
function reverseRows() {
  rows.value = [...rows.value].reverse();
}
let nextClientKey = 0;
function addDraftRow() {
  const key = `client-new-${++nextClientKey}`;
  rows.value = [
    ...rows.value,
    {
      id: -nextClientKey,
      clientKey: key,
      code: key,
      name: "未保存行",
      organizationId: organizationId.value,
      active: true,
      region: "",
      note: "",
      action: "",
    },
  ];
}
function onRowClick(event: TableViewRowEvent<LabRow, RowKey>) {
  rowEvent.value = `${typeof event.rowKey}:${event.rowKey} · ${event.row.code}`;
}
const dialogVisible = ref(false);
const nestedVisible = ref(false);
const dialogNote = ref("");
const probeOption = ref("");
const activeKey = ref<RowKey | null>(null);
const activeKeyLabel = computed(() => `${typeof activeKey.value}:${activeKey.value}`);
let trigger: HTMLElement | null = null;
function openProbe(key: RowKey, event: MouseEvent) {
  activeKey.value = key;
  trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  dialogNote.value = drafts.get(key) ?? "";
  dialogVisible.value = true;
}
function confirmProbe() {
  if (activeKey.value !== null && rows.value.some((row) => row.clientKey === activeKey.value))
    drafts.set(activeKey.value, dialogNote.value);
  dialogVisible.value = false;
}
async function restoreTrigger() {
  nestedVisible.value = false;
  await nextTick();
  if (trigger?.isConnected) trigger.focus();
}
onMounted(loadCustomers);
onBeforeUnmount(() => {
  disposed = true;
  requestVersion++;
});
</script>

<style scoped lang="scss">
.reference-lab {
  height: auto;
  min-height: 100%;

  h1 {
    margin: 0 0 8px;
    font-size: 20px;
  }
}
.lab-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;

  > .el-input {
    flex: 1 1 180px;
  }
  .lab-select {
    width: 120px;
  }
}
.lab-table-card {
  min-width: 0;
}
@media (width < 768px) {
  .page-toolbar {
    flex-wrap: wrap;
  }
}
</style>
