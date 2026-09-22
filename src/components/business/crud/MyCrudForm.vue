<template>
  <MyCrudLayout class="crud-form" :layout="layout" :aria-busy="controller.busy">
    <template #toolbar>
      <div v-if="layout && !embedded" class="crud-form__heading">
        <h1>{{ controller.state.target.mode === "add" ? "新增" : "编辑" }}{{ entityLabel }}</h1>
        <span>
          {{ controller.state.target.mode === "add" ? "填写资料后保存" : "修改资料后保存" }}
        </span>
      </div>
      <MyCrudFormToolbar v-else-if="!layout" v-bind="props" />
      <span v-else class="crud-form__hint">填写资料后保存，带 * 的字段为必填项</span>
    </template>
    <MyCrudFormFeedback v-bind="props" />
    <el-skeleton v-if="controller.state.phase === 'loading'" animated :rows="6" />
    <div v-show="controller.state.phase !== 'loading'" class="crud-form__body">
      <div v-if="slots.header" class="crud-form__header">
        <slot name="header" v-bind="controller" />
      </div>
      <div
        class="crud-form__fields"
        :class="{
          'crud-form__fields--structured': layout?.preset === 'structured',
          'crud-form__fields--simple': layout?.preset === 'simple',
        }"
      >
        <MyCrudFormFields v-bind="props">
          <template
            v-for="field in fields.filter((item) => slots[fieldSlot(item.key)])"
            :key="field.key"
            #[fieldSlot(field.key)]="cell"
          >
            <slot :name="fieldSlot(field.key)" v-bind="cell" />
          </template>
        </MyCrudFormFields>
      </div>
      <section v-for="section in sections" :key="section.key" class="crud-form__section">
        <h3>{{ section.label }}</h3>
        <slot :name="sectionSlot(section.key)" v-bind="controller" />
      </section>
    </div>
    <template v-if="slots.footer || layout" #footer>
      <div class="crud-form__footer">
        <div v-if="slots.footer" class="crud-form__checks">
          <slot name="footer" v-bind="controller" />
        </div>
        <MyCrudFormToolbar v-if="layout" v-bind="props" :footer-mode="true" />
      </div>
    </template>
    <MyBusinessPageHost v-if="host" v-bind="host" />
  </MyCrudLayout>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number, C">
import { inject, onMounted } from "vue";
import { embeddedEditorKey } from "./presentation";
import MyBusinessPageHost from "./MyBusinessPageHost.vue";
import MyCrudLayout from "./MyCrudLayout.vue";
import MyCrudFormToolbar from "./MyCrudFormToolbar.vue";
import MyCrudFormFeedback from "./MyCrudFormFeedback.vue";
import MyCrudFormFields from "./MyCrudFormFields.vue";
import type { CrudFormProps } from "./form-presentation";
import type { CrudFormSlots } from "./types";
import type { FieldKey } from "../fields/types";
import { diagnoseCrudSlots } from "./config";
const props = defineProps<CrudFormProps<Model, Entity, Id, C>>();
const embedded = inject(embeddedEditorKey, undefined);
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
.crud-form__heading h1 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.crud-form__heading span,
.crud-form__hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.crud-form__fields--simple {
  max-width: 840px;
  margin-inline: auto;
}
.crud-form__fields--structured {
  max-width: 1200px;
}
.crud-form__footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.crud-form__checks {
  font-size: 13px;
}
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
