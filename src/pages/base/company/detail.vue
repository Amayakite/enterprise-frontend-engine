<!-- Company detail：仅选择标准视图；字段及业务规则见 config.ts。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" />
    <MyCrudDetail
      v-else
      v-bind="bindings.detail"
      :tabs="[
        { key: 'location', label: '公司位置' },
        { key: 'contract', label: '合同模板' },
      ]"
    >
      <template #tab-location>
        <MapLocationPicker :model-value="state.model?.location ?? null" readonly />
      </template>
      <template #tab-contract>
        <WordTemplateField :model-value="state.model?.contractTemplate ?? null" readonly />
      </template>
    </MyCrudDetail>
  </div>
</template>
<script setup lang="ts">
import WordTemplateField from "@/components/common/WordEditor/WordTemplateField.vue";
import MapLocationPicker from "@/components/common/MapViewer/MapLocationPicker.vue";
import MyCrudDetail from "@/components/business/crud/MyCrudDetail.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { useCrudView } from "@/composables/useCrudView";
import { companyModule } from "./config";
defineOptions({ name: "CompanyDetail" });
const { state, bindings } = useCrudView(companyModule, { view: "detail" });
</script>
