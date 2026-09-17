<!-- Sale list：仅选择标准视图；字段及业务规则见 config.ts。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" />
    <MyCrudList v-else v-bind="bindings.list" />
  </div>
</template>
<script setup lang="ts">
import MyCrudList from "@/components/business/crud/MyCrudList.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { useCrudView } from "@/composables/useCrudView";
import { saleModule } from "./config";
defineOptions({ name: "SaleManagement" });
const { state, bindings } = useCrudView(saleModule, { view: "list" });
</script>
