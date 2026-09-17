<template>
  <div class="meeting-detail">
    <div class="page-toolbar meeting-detail__header">
      <div class="page-toolbar__left">
        <el-button @click="backToList">返回列表</el-button>
        <strong>会议申请详情</strong>
        <el-tag v-if="detail" effect="plain">{{ detail.applyCode }}</el-tag>
      </div>
      <div v-if="detail" class="page-toolbar__right">
        <el-button
          v-if="detail.status === 'draft' || detail.status === 'rejected'"
          v-hasPerm="'task:meeting-application:update'"
          type="primary"
          @click="openEditor"
        >
          编辑
        </el-button>
      </div>
    </div>

    <el-skeleton v-if="loading" class="meeting-detail__loading" :rows="10" animated />
    <el-empty v-else-if="!detail" description="未找到会议申请" />
    <template v-else>
      <el-card shadow="never">
        <MyDesc
          :model-value="detail"
          :fields="meetingApplicationFields"
          :context="pageContext"
          :columns="2"
        />
      </el-card>

      <el-card header="费用预算" shadow="never">
        <el-table :data="detail.budgets" border>
          <el-table-column prop="budgetType" label="费用类型" min-width="140" />
          <el-table-column prop="estimatedAmount" label="预估金额（元）" width="150" align="right" />
          <el-table-column prop="remark" label="费用说明" min-width="220" />
        </el-table>
        <div class="meeting-detail__total">预算合计：¥{{ detail.budgetTotal }}</div>
      </el-card>

      <el-card header="参会人员" shadow="never">
        <el-table :data="detail.attendees" border>
          <el-table-column prop="name" label="姓名" min-width="120" />
          <el-table-column prop="mobile" label="手机号" width="140" />
          <el-table-column prop="checkinStatus" label="签到状态" width="110">
            <template #default="{ row }">
              <DictTag code="pilot_attendee_status" :model-value="row.checkinStatus" />
            </template>
          </el-table-column>
          <el-table-column prop="checkinTime" label="签到时间" width="170" />
          <el-table-column prop="feedback" label="反馈" min-width="180" />
        </el-table>
      </el-card>

      <el-card header="会议议程" shadow="never">
        <el-table :data="detail.agenda" border>
          <el-table-column prop="startTime" label="开始时间" width="110" />
          <el-table-column prop="endTime" label="结束时间" width="110" />
          <el-table-column prop="subject" label="议程主题" min-width="220" />
          <el-table-column prop="speaker" label="讲者" min-width="140" />
        </el-table>
      </el-card>

      <el-card header="审批记录" shadow="never">
        <ApprovalTimeline :items="timeline" />
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import MeetingApplicationAPI from "@/api/task/meeting-application";
import type { ApprovalTimelineItem } from "@/api/task/meeting-application";
import MyDesc from "@/components/business/MyDesc.vue";
import DictTag from "@/components/business/DictTag.vue";
import { toMeetingApplicationForm } from "./adapters";
import ApprovalTimeline from "./components/ApprovalTimeline.vue";
import { meetingApplicationFields } from "./fields";
import type {
  MeetingApplicationFormModel,
  MeetingApplicationPageContext,
} from "./types";

defineOptions({ name: "MeetingApplicationDetail" });

const route = useRoute();
const router = useRouter();
const id = ref(typeof route.params.id === "string" ? route.params.id : "");
const pageContext: MeetingApplicationPageContext = { organizationId: "org-a" };
const detail = ref<MeetingApplicationFormModel>();
const timeline = ref<ApprovalTimelineItem[]>([]);
const loading = ref(false);

watch(
  id,
  async (value) => {
    detail.value = undefined;
    timeline.value = [];
    if (!value) {
      await router.replace("/task/meeting-application");
      return;
    }
    loading.value = true;
    try {
      const [item, approvalItems] = await Promise.all([
        MeetingApplicationAPI.getDetail(value),
        MeetingApplicationAPI.getTimeline(value),
      ]);
      detail.value = toMeetingApplicationForm(item);
      timeline.value = approvalItems;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

function backToList() {
  void router.push("/task/meeting-application");
}

function openEditor() {
  if (id.value) void router.push(`/task/meeting-application/edit/${id.value}`);
}
</script>

<style scoped lang="scss">
.meeting-detail {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
  height: 100%;
  padding: var(--page-padding);
  overflow: auto;
  background: var(--page-bg);
}

.meeting-detail__header {
  margin-bottom: 0;
  padding: 12px 16px;
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
}

.meeting-detail__loading {
  padding: 24px;
  background: var(--content-bg);
  border-radius: var(--card-radius);
}

.meeting-detail__total {
  padding-top: 12px;
  text-align: right;
  color: var(--el-text-color-regular);
  font-weight: 600;
}
</style>
