<!-- Company add：仅选择标准视图；字段及业务规则见 config.ts。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" />
    <MyCrudForm v-else v-bind="bindings.form">
      <template #field-location="{ value, update, commit, readonly }">
        <MapLocationPicker
          :model-value="value"
          :readonly="readonly"
          @update:model-value="
            (value) => {
              update(value);
              commit();
            }
          "
        />
      </template>
      <template #field-contractTemplate="{ value, update, commit, readonly }">
        <WordTemplateField
          :model-value="value"
          :readonly="readonly"
          @update:model-value="
            (value) => {
              update(value);
              commit();
            }
          "
        />
      </template>
    </MyCrudForm>
  </div>
</template>
<script setup lang="ts">
import WordTemplateField from "@/components/common/WordEditor/WordTemplateField.vue";
import MapLocationPicker from "@/components/common/MapViewer/MapLocationPicker.vue";
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { useCrudView } from "@/composables/useCrudView";
import { companyModule } from "./config";
defineOptions({ name: "CompanyAdd" });
const { state, bindings } = useCrudView(companyModule, { view: "add" });
</script>
