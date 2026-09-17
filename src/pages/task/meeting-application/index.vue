<template>
  <div class="page-container">
    <el-card class="page-search" shadow="never">
      <MySearch
        :fields="meetingApplicationSearchFields"
        :context="pageContext"
        :create-initial-query="createInitialMeetingApplicationSearch"
        :loading="loading"
        @submit="applySearch"
        @reset="applySearch"
      />
    </el-card>

    <el-card class="meeting-list" shadow="never">
      <MyTable
        :rows="list"
        :fields="meetingApplicationListFields"
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
        <template #title><strong>会议申请</strong></template>
        <template #toolbar>
          <el-button
            v-hasPerm="'task:meeting-application:create'"
            type="primary"
            @click="openEditor()"
          >
            新增
          </el-button>
          <el-button
            v-hasPerm="'task:meeting-application:submit'"
            :disabled="!selectedIds.length"
            @click="runBatch('submit')"
          >
            批量提交
          </el-button>
          <el-button
            v-hasPerm="'task:meeting-application:approve'"
            :disabled="!selectedIds.length"
            @click="runBatch('approve')"
          >
            批量审核
          </el-button>
          <el-button
            v-hasPerm="'task:meeting-application:revoke'"
            :disabled="!selectedIds.length"
            @click="runBatch('revoke')"
          >
            批量撤回
          </el-button>
        </template>
        <template #tools>
          <el-button :loading="loading" @click="fetchData">刷新</el-button>
        </template>
        <template #actions="{ row }">
          <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'draft' || row.status === 'rejected'"
            v-hasPerm="'task:meeting-application:update'"
            link
            type="primary"
            @click="openEditor(row.id)"
          >
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'draft'"
            v-hasPerm="'task:meeting-application:delete'"
            link
            type="danger"
            @click="removeRow(row.id)"
          >
            删除
          </el-button>
        </template>
      </MyTable>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import MeetingApplicationAPI from "@/api/task/meeting-application";
import type {
  MeetingApplicationItem,
  MeetingApplicationQueryParams,
} from "@/api/task/meeting-application";
import MySearch from "@/components/business/MySearch.vue";
import MyTable from "@/components/table/MyTable.vue";
import type { TableSort } from "@/components/table/types";
import { usePageTable } from "@/composables";
import { viewInvalidationRevision } from "@/composables/useViewInvalidation";
import {
  createInitialMeetingApplicationSearch,
  toMeetingApplicationQuery,
} from "./adapters";
import {
  meetingApplicationListFields,
  meetingApplicationSearchFields,
} from "./fields";
import type {
  MeetingApplicationPageContext,
  MeetingApplicationSearchModel,
} from "./types";

defineOptions({ name: "MeetingApplication" });

type BatchAction = "submit" | "approve" | "revoke";

const router = useRouter();
const pageContext: MeetingApplicationPageContext = { organizationId: "org-a" };
const selectedIds = ref<string[]>([]);
const sort = ref<TableSort<MeetingApplicationItem> | null>(null);
const tableHeight = "max(360px, calc(100vh - 390px))";
const { loading, list, total, params, fetchData } = usePageTable<
  MeetingApplicationItem,
  MeetingApplicationQueryParams
>({
  initialParams: { pageNum: 1, pageSize: 10 },
  request: MeetingApplicationAPI.getPage,
});

function applySearch(value: MeetingApplicationSearchModel) {
  Object.assign(params, toMeetingApplicationQuery(value, 1, params.pageSize));
  selectedIds.value = [];
  void fetchData();
}

function changePage(value: { pageNum: number; pageSize: number }) {
  Object.assign(params, value);
  selectedIds.value = [];
  void fetchData();
}

function changeSort(value: TableSort<MeetingApplicationItem> | null) {
  sort.value = value;
  params.sortKey = value?.key as MeetingApplicationQueryParams["sortKey"];
  params.sortOrder = value?.order;
  params.pageNum = 1;
  void fetchData();
}

function openEditor(id?: string) {
  void router.push(id ? `/task/meeting-application/edit/${id}` : "/task/meeting-application/edit");
}

function openDetail(id: string) {
  void router.push(`/task/meeting-application/detail/${id}`);
}

async function confirmed(message: string, title: string) {
  try {
    await ElMessageBox.confirm(message, title, { type: "warning" });
    return true;
  } catch {
    return false;
  }
}

async function removeRow(id: string) {
  if (!(await confirmed("确定删除这张会议申请吗？", "删除确认"))) return;
  await MeetingApplicationAPI.remove([id]);
  ElMessage.success("删除成功");
  selectedIds.value = selectedIds.value.filter((item) => item !== id);
  await fetchData();
}

async function runBatch(action: BatchAction) {
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  const actionText: Record<BatchAction, string> = {
    submit: "提交",
    approve: "审核",
    revoke: "撤回",
  };
  const text = actionText[action];
  if (!(await confirmed(`确定${text}选中的 ${ids.length} 张会议申请吗？`, `${text}确认`))) return;
  await MeetingApplicationAPI[action](ids);
  ElMessage.success(`${text}成功`);
  selectedIds.value = [];
  await fetchData();
}

let handledInvalidation = viewInvalidationRevision("meeting-application");
onMounted(() => {
  void fetchData();
});
onActivated(() => {
  const revision = viewInvalidationRevision("meeting-application");
  if (revision === handledInvalidation) return;
  handledInvalidation = revision;
  void fetchData();
});
</script>

<style scoped lang="scss">
.meeting-list {
  min-height: 0;

  :deep(.el-card__body) {
    min-height: 0;
  }
}
</style>
