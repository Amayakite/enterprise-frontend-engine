<template>
  <MyCrudLayout class="crud-form" :aria-busy="controller.busy">
    <template #toolbar><MyCrudFormToolbar v-bind="props" /></template>
    <MyCrudFormFeedback v-bind="props" />
    <el-skeleton v-if="controller.state.phase === 'loading'" animated :rows="6" />
    <div v-show="controller.state.phase !== 'loading'" class="crud-form__body">
      <div v-if="slots.header" class="crud-form__header">
        <slot name="header" v-bind="controller" />
      </div>
      <MyCrudFormFields v-bind="props">
        <template
          v-for="field in fields.filter((item) => slots[fieldSlot(item.key)])"
          :key="field.key"
          #[fieldSlot(field.key)]="cell"
        >
          <slot :name="fieldSlot(field.key)" v-bind="cell" />
        </template>
      </MyCrudFormFields>
      <section v-for="section in sections" :key="section.key" class="crud-form__section">
        <h3>{{ section.label }}</h3>
        <slot :name="sectionSlot(section.key)" v-bind="controller" />
      </section>
    </div>
    <template v-if="slots.footer" #footer><slot name="footer" v-bind="controller" /></template>
  </MyCrudLayout>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number, C">
import { onMounted } from "vue";
import MyCrudLayout from "./MyCrudLayout.vue";
import MyCrudFormToolbar from "./MyCrudFormToolbar.vue";
import MyCrudFormFeedback from "./MyCrudFormFeedback.vue";
import MyCrudFormFields from "./MyCrudFormFields.vue";
import type { CrudFormProps } from "./form-presentation";
import type { CrudFormSlots } from "./types";
import type { FieldKey } from "../fields/types";
import { diagnoseCrudSlots } from "./config";
const props = defineProps<CrudFormProps<Model, Entity, Id, C>>();
const slots = defineSlots<CrudFormSlots<Model, Entity, Id>>();
const fieldSlot = (key: FieldKey<Model>) =>
  `field-${key}` as Exclude<keyof typeof slots, "footer" | "header">;
const sectionSlot = (key: string) =>
  `section-${key}` as Exclude<keyof typeof slots, "footer" | "header">;
onMounted(() =>
  diagnoseCrudSlots("MyCrudForm", slots, [
    "header",
    "footer",
    ...props.fields.map((field) => `field-${field.key}`),
    ...(props.sections ?? []).map((section) => `section-${section.key}`),
  ])
);
</script>
<style scoped>
.crud-form__header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.crud-form__section {
  margin-top: 20px;
}
.crud-form__section h3 {
  font-size: 15px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
</style>
