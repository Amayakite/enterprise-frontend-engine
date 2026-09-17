<!-- Sale add：仅选择标准视图；字段及业务规则见 config.ts。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" />
    <MyCrudForm v-else v-bind="bindings.form" />
  </div>
</template>
<script setup lang="ts">
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { useCrudView } from "@/composables/useCrudView";
import { saleModule } from "./config";
defineOptions({ name: "SaleAdd" });
const { state, bindings } = useCrudView(saleModule, { view: "add" });
</script>
