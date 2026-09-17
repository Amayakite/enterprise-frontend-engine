<!-- Sale detail：仅选择标准视图；字段及业务规则见 config.ts。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" />
    <MyCrudDetail v-else v-bind="bindings.detail" />
  </div>
</template>
<script setup lang="ts">
import MyCrudDetail from "@/components/business/crud/MyCrudDetail.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { useCrudView } from "@/composables/useCrudView";
import { saleModule } from "./config";
defineOptions({ name: "SaleDetail" });
const { state, bindings } = useCrudView(saleModule, { view: "detail" });
</script>
