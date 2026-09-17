<template>
  <div class="page-container">
    <MyCrudList
      :config="config.list!"
      :controller="list"
      :context="context"
      :navigation="navigation"
      :scope-key="context.scopeKey"
      :preference="{
        user: String(user.userInfo.userId ?? 'session'),
        module: config.key,
        scope: context.scopeKey,
        version: '2',
      }"
    >
      <template #toolbar-right>
        <span class="fee-total">本页合计 {{ pageAmount }}</span>
      </template>
    </MyCrudList>
  </div>
</template>

<script setup lang="ts">
import MyCrudList from "@/components/business/crud/MyCrudList.vue";
import { useCrudList } from "@/composables/useCrudList";
import { useUserStore } from "@/stores/user";
import { formatDecimalCurrency, sumDecimals } from "@/utils/decimal";
import { createAccessScopeKey } from "@/utils/identity";
import type { CrudNavigation } from "@/components/business/crud/types";
import { createFeeCrud } from "./config";
import type { FeePageContext } from "./types";

defineOptions({ name: "TaskFee" });
const router = useRouter();
const user = useUserStore();
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
  add: async () => {
    await router.push("/task/fee/add");
  },
  edit: async (id) => {
    await router.push(`/task/fee/edit/${encodeURIComponent(id)}`);
  },
  detail: async (id) => {
    await router.push(`/task/fee/detail/${encodeURIComponent(id)}`);
  },
};
const config = createFeeCrud(navigation);
const list = useCrudList(config.list!, () => context.value, { invalidationKey: config.key });
const pageAmount = computed(() =>
  formatDecimalCurrency(sumDecimals(list.state.rows.map((row) => row.amount)))
);
</script>

<style scoped>
.fee-total {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
}
</style>
