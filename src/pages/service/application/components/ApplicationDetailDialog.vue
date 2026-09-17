<template>
  <MyDialog v-model="visible" title="服务申请详情" width="min(980px, 95vw)" destroy-on-close>
    <el-skeleton v-if="loading" :rows="9" animated />
    <MyDesc
      v-else-if="detail"
      :model-value="detail"
      :fields="serviceApplicationFields"
      :context="context"
      :columns="3"
    />
    <el-empty v-else description="未找到申请" />
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </MyDialog>
</template>

<script setup lang="ts">
import MyDesc from "@/components/business/MyDesc.vue";
import ServiceApplicationAPI from "@/api/service/application";
import { toServiceApplicationForm } from "../adapters";
import { serviceApplicationFields } from "../fields";
import type { ServiceApplicationFormModel, ServiceApplicationPageContext } from "../types";

const props = defineProps<{ id: string | null; context: ServiceApplicationPageContext }>();
const visible = defineModel<boolean>({ required: true });
const loading = ref(false);
const detail = ref<ServiceApplicationFormModel>();
watch(
  () => [visible.value, props.id] as const,
  async ([open, id]) => {
    if (!open || !id) return;
    loading.value = true;
    try {
      detail.value = toServiceApplicationForm(await ServiceApplicationAPI.getDetail(id));
    } finally {
      loading.value = false;
    }
  }
);
</script>
