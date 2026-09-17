<template>
  <div class="meeting-editor">
    <div class="page-toolbar meeting-editor__header">
      <div class="page-toolbar__left">
        <el-button @click="backToList">返回列表</el-button>
        <strong>{{ id ? "编辑会议申请" : "新增会议申请" }}</strong>
        <el-tag v-if="form.applyCode" effect="plain">{{ form.applyCode }}</el-tag>
      </div>
      <div class="page-toolbar__right">
        <el-button type="primary" :loading="submitting" :disabled="loading" @click="save">
          保存
        </el-button>
      </div>
    </div>

    <el-alert
      title="当前使用内存 Mock；备注填写“保存失败”可验证失败后保留整单输入。"
      type="info"
      :closable="false"
    />

    <el-skeleton v-if="loading" class="meeting-editor__loading" :rows="10" animated />
    <template v-else>
      <el-card shadow="never">
        <MyForm
          ref="formRef"
          v-model="form"
          :fields="meetingApplicationFields"
          :links="meetingApplicationLinks"
          :context="pageContext"
          :create-initial-model="createInitialMeetingApplicationForm"
          :mode="id ? 'edit' : 'add'"
          :form-key="formKey"
          :disabled="submitting"
          :columns="2"
        >
          <template #field-longitude="{ value, setValue, readonly }">
            <MeetingLocationPicker
              :longitude="value"
              :latitude="form.latitude"
              :disabled="readonly"
              @update:longitude="setValue"
              @update:latitude="setLatitude"
            />
          </template>
        </MyForm>
      </el-card>

      <el-card shadow="never">
        <MeetingBudgetTable ref="budgetRef" v-model="form.budgets" :loading="submitting" />
      </el-card>
      <el-card shadow="never">
        <MeetingAttendeeTable
          ref="attendeeRef"
          v-model="form.attendees"
          :organization-id="pageContext.organizationId"
          :target-id="form.targetId"
          :service-item-id="form.serviceItemId"
          :loading="submitting"
        />
      </el-card>
      <el-card shadow="never">
        <MeetingAgendaEditor ref="agendaRef" v-model="form.agenda" :loading="submitting" />
      </el-card>

      <div class="meeting-editor__footer">
        <el-button type="primary" :loading="submitting" @click="save">保存</el-button>
        <el-button :disabled="submitting" @click="backToList">取消</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import MeetingApplicationAPI from "@/api/task/meeting-application";
import MyForm from "@/components/business/MyForm/index.vue";
import { cloneModel, sameModelValue } from "@/components/business/fields/model";
import type { MyFormExpose } from "@/components/business/fields/types";
import { invalidateView } from "@/composables/useViewInvalidation";
import { useTagsViewStore } from "@/stores";
import { sumDecimals, toDecimal, toFixedDecimal } from "@/utils/decimal";
import {
  createInitialMeetingApplicationForm,
  toMeetingApplicationForm,
  toMeetingApplicationPayload,
} from "./adapters";
import MeetingAgendaEditor from "./components/MeetingAgendaEditor.vue";
import MeetingAttendeeTable from "./components/MeetingAttendeeTable.vue";
import MeetingBudgetTable from "./components/MeetingBudgetTable.vue";
import MeetingLocationPicker from "./components/MeetingLocationPicker.vue";
import { meetingApplicationFields, meetingApplicationLinks } from "./fields";
import type { MeetingApplicationFormModel, MeetingApplicationPageContext } from "./types";

defineOptions({ name: "MeetingApplicationEdit" });

interface ValidatableSection {
  commitAndValidate: () => Promise<boolean>;
}

const route = useRoute();
const router = useRouter();
const tagsViewStore = useTagsViewStore();
const viewFullPath = route.fullPath;
const viewKeepAlive = route.meta.keepAlive === true;
const id = ref(typeof route.params.id === "string" ? route.params.id : null);
const pageContext: MeetingApplicationPageContext = { organizationId: "org-a" };
const form = ref(createInitialMeetingApplicationForm());
const snapshot = ref(cloneModel(form.value));
const formRef = ref<MyFormExpose<MeetingApplicationFormModel>>();
const budgetRef = ref<ValidatableSection>();
const attendeeRef = ref<ValidatableSection>();
const agendaRef = ref<ValidatableSection>();
const loading = ref(false);
const submitting = ref(false);
const revision = ref(0);
const allowLeave = ref(false);
const formKey = computed(() => id.value ?? `new-${revision.value}`);
const budgetTotal = computed(() =>
  toFixedDecimal(sumDecimals(form.value.budgets.map((item) => item.estimatedAmount || "0")))
);
const dirty = computed(() => !sameModelValue(form.value, snapshot.value));

watch(
  budgetTotal,
  (value) => {
    if (form.value.budgetTotal === value) return;
    formRef.value?.applyPatch({ budgetTotal: value });
  },
  { immediate: true }
);

watch(
  id,
  async (value) => {
    revision.value++;
    loading.value = true;
    try {
      const next = value
        ? toMeetingApplicationForm(await MeetingApplicationAPI.getDetail(value))
        : createInitialMeetingApplicationForm();
      if (value && next.status !== "draft" && next.status !== "rejected") {
        ElMessage.warning("当前状态不能编辑");
        allowLeave.value = true;
        await router.replace(`/task/meeting-application/detail/${value}`);
        return;
      }
      form.value = next;
      snapshot.value = cloneModel(next);
      await nextTick();
      formRef.value?.hydrate(next);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

async function save() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    if (!(await budgetRef.value?.commitAndValidate())) return;
    if (!(await attendeeRef.value?.commitAndValidate())) return;
    if (!(await agendaRef.value?.commitAndValidate())) return;

    await nextTick();
    const header = await formRef.value?.validate();
    if (!header?.valid) {
      const first = header?.errors[0];
      if (first) formRef.value?.focusField(first.field);
      return;
    }
    if (
      form.value.budgets.some((item) => toDecimal(item.estimatedAmount || 0).lessThanOrEqualTo(0))
    ) {
      ElMessage.warning("费用预算金额必须大于 0");
      return;
    }
    if (toDecimal(form.value.amount || 0).lessThan(toDecimal(budgetTotal.value))) {
      ElMessage.warning("申请金额不能小于费用预算合计");
      formRef.value?.focusField("amount");
      return;
    }
    if (
      form.value.controlLocation &&
      (!form.value.longitude.trim() || !form.value.latitude.trim())
    ) {
      ElMessage.warning("请填写签到经纬度");
      formRef.value?.focusField("longitude");
      return;
    }

    const payload = toMeetingApplicationPayload({ ...form.value, budgetTotal: budgetTotal.value });
    const result = id.value
      ? await MeetingApplicationAPI.update(id.value, { ...payload, version: form.value.version })
      : await MeetingApplicationAPI.create(payload);
    ElMessage.success("会议申请保存成功");
    invalidateView("meeting-application");
    allowLeave.value = true;
    await router.replace(`/task/meeting-application/detail/${result.id}`);
  } finally {
    submitting.value = false;
  }
}

function setLatitude(value: string) {
  formRef.value?.applyPatch({ latitude: value }, "user");
}

function backToList() {
  void router.push("/task/meeting-application");
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!allowLeave.value && dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}

async function canLeavePage() {
  if (loading.value || submitting.value) return false;
  if (allowLeave.value || !dirty.value) return true;
  try {
    await ElMessageBox.confirm("会议申请还有未保存修改，确定离开吗？", "未保存提示", {
      type: "warning",
    });
    allowLeave.value = true;
    return true;
  } catch {
    return false;
  }
}

const unregisterLeaveGuard = tagsViewStore.registerLeaveGuard(
  viewFullPath,
  canLeavePage,
  () => (allowLeave.value = false)
);

onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => {
  unregisterLeaveGuard();
  window.removeEventListener("beforeunload", beforeUnload);
});
onBeforeRouteLeave(async () => {
  if (viewKeepAlive && tagsViewStore.cachedViews.includes(viewFullPath))
    return true;
  return canLeavePage();
});
</script>

<style scoped lang="scss">
.meeting-editor {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
  height: 100%;
  padding: var(--page-padding);
  overflow: auto;
  background: var(--page-bg);
}

.meeting-editor__header {
  margin-bottom: 0;
  padding: 12px 16px;
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
}

.meeting-editor__loading {
  padding: 24px;
  background: var(--content-bg);
  border-radius: var(--card-radius);
}

.meeting-editor__footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
}
</style>
