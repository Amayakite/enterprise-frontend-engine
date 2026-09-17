<template>
  <div class="page-container">
    <el-card class="page-search" shadow="never">
      <MySearch
        :fields="serviceApplicationSearchFields"
        :context="pageContext"
        :create-initial-query="createInitialServiceApplicationSearch"
        :loading="loading"
        @submit="applySearch"
        @reset="applySearch"
      />
    </el-card>
    <el-card class="pilot-card" shadow="never">
      <MyTable
        :rows="list"
        :fields="serviceApplicationListFields"
        :context="pageContext"
        :get-row-key="(row) => row.id"
        :height="tableHeight"
        :loading="loading"
        :pagination="{ pageNum: params.pageNum, pageSize: params.pageSize, total }"
        :sort="sort"
        :selection="{ mode: 'multiple', keys: selectedIds }"
        :engine-options="{ stripe: true }"
        @page-change="changePage"
        @sort-change="changeSort"
        @selection-change="selectedIds = $event.keys"
        @row-dblclick="openDetail($event.row.id)"
      >
        <template #title><strong>服务申请</strong></template>
        <template #toolbar>
          <el-button v-hasPerm="'service:application:create'" type="primary" @click="openEditor()">
            新增
          </el-button>
          <el-button
            v-hasPerm="'service:application:approve'"
            :disabled="!selectedIds.length"
            @click="runBatch('approve')"
          >
            批量审核
          </el-button>
          <el-button
            v-hasPerm="'service:application:revoke'"
            :disabled="!selectedIds.length"
            @click="runBatch('revoke')"
          >
            批量弃审
          </el-button>
        </template>
        <template #tools>
          <el-button :loading="loading" @click="fetchData">刷新</el-button>
        </template>
        <template #actions="{ row }">
          <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'draft'"
            v-hasPerm="'service:application:update'"
            link
            type="primary"
            @click="openEditor(row.id)"
          >
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'draft'"
            v-hasPerm="'service:application:delete'"
            link
            type="danger"
            @click="removeRows([row.id])"
          >
            删除
          </el-button>
        </template>
      </MyTable>
    </el-card>
    <ApplicationEditorDialog
      v-model="editorVisible"
      :id="editingId"
      :context="pageContext"
      @saved="refreshAfterMutation"
    />
    <ApplicationDetailDialog v-model="detailVisible" :id="detailId" :context="pageContext" />
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import ServiceApplicationAPI from "@/api/service/application";
import type {
  ServiceApplicationItem,
  ServiceApplicationQueryParams,
} from "@/api/service/application";
import MySearch from "@/components/business/MySearch.vue";
import MyTable from "@/components/table/MyTable.vue";
import type { TableSort } from "@/components/table/types";
import { usePageTable } from "@/composables";
import { createInitialServiceApplicationSearch, toServiceApplicationQuery } from "./adapters";
import { serviceApplicationListFields, serviceApplicationSearchFields } from "./fields";
import ApplicationDetailDialog from "./components/ApplicationDetailDialog.vue";
import ApplicationEditorDialog from "./components/ApplicationEditorDialog.vue";
import type { ServiceApplicationPageContext, ServiceApplicationSearchModel } from "./types";

defineOptions({ name: "ServiceApplication" });
const pageContext: ServiceApplicationPageContext = { organizationId: "org-a" };
const search = ref(createInitialServiceApplicationSearch());
const selectedIds = ref<string[]>([]);
const sort = ref<TableSort<ServiceApplicationItem> | null>(null);
const editorVisible = ref(false);
const editingId = ref<string | null>(null);
const detailVisible = ref(false);
const detailId = ref<string | null>(null);
const tableHeight = "max(360px, calc(100vh - 390px))";
const { loading, list, total, params, fetchData } = usePageTable<
  ServiceApplicationItem,
  ServiceApplicationQueryParams
>({ initialParams: { pageNum: 1, pageSize: 10 }, request: ServiceApplicationAPI.getPage });

function applySearch(value: ServiceApplicationSearchModel) {
  search.value = value;
  Object.assign(params, toServiceApplicationQuery(value, 1, params.pageSize));
  selectedIds.value = [];
  void fetchData();
}
function changePage(value: { pageNum: number; pageSize: number }) {
  Object.assign(params, value);
  selectedIds.value = [];
  void fetchData();
}
function changeSort(value: TableSort<ServiceApplicationItem> | null) {
  sort.value = value;
  params.sortKey = value?.key as ServiceApplicationQueryParams["sortKey"];
  params.sortOrder = value?.order;
  params.pageNum = 1;
  void fetchData();
}
function openEditor(id: string | null = null) {
  editingId.value = id;
  editorVisible.value = true;
}
function openDetail(id: string) {
  detailId.value = id;
  detailVisible.value = true;
}
async function confirmed(message: string, title: string) {
  try {
    await ElMessageBox.confirm(message, title, { type: "warning" });
    return true;
  } catch {
    return false;
  }
}
async function removeRows(ids: string[]) {
  if (!(await confirmed(`确定删除选中的 ${ids.length} 张服务申请吗？`, "删除确认"))) return;
  await ServiceApplicationAPI.remove(ids);
  ElMessage.success("删除成功");
  refreshAfterMutation();
}
async function runBatch(action: "approve" | "revoke") {
  const text = action === "approve" ? "审核" : "弃审";
  const ids = [...selectedIds.value];
  if (!(await confirmed(`确定${text}选中的 ${ids.length} 张申请吗？`, `${text}确认`))) return;
  await ServiceApplicationAPI[action](ids);
  ElMessage.success(`${text}成功`);
  refreshAfterMutation();
}
function refreshAfterMutation() {
  selectedIds.value = [];
  void fetchData();
}
onMounted(fetchData);
</script>

<style scoped lang="scss">
.pilot-card {
  min-height: 0;
  :deep(.el-card__body) {
    min-height: 0;
  }
}
</style>
