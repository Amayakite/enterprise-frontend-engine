<template>
  <div class="page-container fee-editor">
    <MyFeedback
      message="当前使用开发进程内存 Mock；备注填写“保存失败”可验证服务端拒绝后保留输入。"
    />
    <MyCrudForm
      :controller="controller"
      :fields="config.form!.fields"
      :links="feeLinks"
      :context="context"
      :readonly-reason="controller.readonlyReason"
      :entity-key="controller.state.target.mode === 'edit' ? controller.state.target.id : 'new'"
      :columns="2"
    />
  </div>
</template>

<script setup lang="ts">
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { useCrudForm } from "@/composables/useCrudForm";
import { useUserStore } from "@/stores/user";
import { createAccessScopeKey } from "@/utils/identity";
import type { CrudNavigation, CrudTarget } from "@/components/business/crud/types";
import { createFeeCrud, feeLinks } from "./config";
import type { FeePageContext } from "./types";

const props = defineProps<{ id?: string }>();
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
  saved: async (id) => {
    await router.replace(`/task/fee/detail/${encodeURIComponent(id)}`);
  },
  close: async () => {
    await router.push("/task/fee");
  },
};
const config = createFeeCrud(navigation);
const target = (id?: string): CrudTarget<string> => (id ? { mode: "edit", id } : { mode: "add" });
const controller = useCrudForm(config.form!, {
  context: () => context.value,
  navigation,
  initialTarget: target(props.id),
  invalidateViewKey: config.key,
});
let mounted = false;
onMounted(async () => {
  mounted = true;
  await controller.open(target(props.id));
});
watch(
  () => props.id,
  async (value, previous) => {
    if (mounted && value !== previous) await controller.open(target(value));
  }
);
</script>

<style scoped>
.fee-editor {
  gap: 12px;
}
</style>
