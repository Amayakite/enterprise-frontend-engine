<template>
  <div class="page-container fee-detail">
    <MyFeedback message="当前详情来自开发进程内存 Mock；页面回读不代表正式数据库已持久化。" />
    <MyCrudDetail
      :controller="detail"
      :fields="config.fields"
      :actions="config.actions"
      :context="context"
      :back="navigation.close"
      :columns="2"
    >
      <template #actions>
        <ActionButton
          v-if="hasPerm('task:fee:update') && detail.state.id"
          label="编辑"
          tone="primary"
          :link="false"
          :disabled="detail.state.phase !== 'ready' || !!detail.busyActionKey"
          :disabled-reason="
            detail.state.entity?.status === 'approved' ? '已审核单据需先弃审' : undefined
          "
          @click="navigation.edit!(detail.state.id!)"
        />
      </template>
    </MyCrudDetail>
  </div>
</template>

<script setup lang="ts">
import MyCrudDetail from "@/components/business/crud/MyCrudDetail.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import ActionButton from "@/components/business/ActionButton.vue";
import { useCrudDetail } from "@/composables/useCrudDetail";
import { useUserStore } from "@/stores/user";
import { hasPerm } from "@/utils/auth";
import { createAccessScopeKey } from "@/utils/identity";
import type { CrudNavigation } from "@/components/business/crud/types";
import { createFeeDetailConfig } from "./config";
import type { FeePageContext } from "./types";

defineOptions({ name: "TaskFeeDetail" });
const route = useRoute();
const router = useRouter();
const user = useUserStore();
const id = ref(typeof route.params.id === "string" ? route.params.id : null);
const context = computed<FeePageContext>(() => ({
  organizationId: "org-a",
  scopeKey: createAccessScopeKey(
    "task-fee",
    "org-a",
    user.userInfo.userId ?? "session",
    user.userInfo.perms
  ),
}));
const navigation: CrudNavigation<string> = {
  edit: async (value) => {
    await router.push(`/task/fee/edit/${encodeURIComponent(value)}`);
  },
  close: async () => {
    await router.push("/task/fee");
  },
};
const config = createFeeDetailConfig(navigation);
const detail = useCrudDetail(config, () => context.value);
watch(
  id,
  (value) => {
    if (value) void detail.load(value);
  },
  { immediate: true }
);
</script>

<style scoped>
.fee-detail {
  gap: 12px;
}
</style>
