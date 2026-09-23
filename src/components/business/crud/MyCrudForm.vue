<template>
  <MyCrudLayout
    class="crud-form"
    role="form"
    :aria-label="`${entityLabel || '业务'}表单`"
    data-crud-keyboard-scope
    :layout="layout"
    :aria-busy="controller.busy"
    @keydown="onFormKeydown"
  >
    <template #toolbar>
      <div v-if="layout && !embedded" class="crud-form__heading">
        <h1>{{ controller.state.target.mode === "add" ? "新增" : "编辑" }}{{ entityLabel }}</h1>
        <span>
          {{ controller.state.target.mode === "add" ? "填写资料后保存" : "修改资料后保存" }}
        </span>
      </div>
      <MyCrudFormToolbar v-else-if="!layout" v-bind="props" />
      <span v-else class="crud-form__hint">填写资料后保存，带 * 的字段为必填项</span>
      <nav v-if="navigation.length > 1" class="crud-form__navigation" aria-label="表单分区">
        <button
          v-for="item in navigation"
          :key="item.key"
          type="button"
          :disabled="controller.state.phase === 'loading'"
          @click="navigate(item)"
        >
          {{ item.label }}
          <span v-if="item.errors" class="crud-form__error-count">{{ item.errors }} 项错误</span>
        </button>
      </nav>
    </template>
    <MyCrudFormFeedback v-bind="props" />
    <el-skeleton v-if="controller.state.phase === 'loading'" animated :rows="6" />
    <div ref="body" v-show="controller.state.phase !== 'loading'" class="crud-form__body">
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
        <MyCrudFormFields v-bind="props" @groups-change="groups = $event">
          <template
            v-for="field in fields.filter((item) => slots[fieldSlot(item.key)])"
            :key="field.key"
            #[fieldSlot(field.key)]="cell"
          >
            <slot :name="fieldSlot(field.key)" v-bind="cell" />
          </template>
        </MyCrudFormFields>
      </div>
      <section
        v-for="section in sections"
        :key="section.key"
        :data-crud-section="section.key"
        tabindex="-1"
        class="crud-form__section"
      >
        <h2>{{ section.label }}</h2>
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
import { computed, inject, nextTick, onMounted, ref, shallowRef } from "vue";
import { crudFormDisabledReason } from "./form-presentation";
import { embeddedEditorKey } from "./presentation";
import MyBusinessPageHost from "./MyBusinessPageHost.vue";
import MyCrudLayout from "./MyCrudLayout.vue";
import MyCrudFormToolbar from "./MyCrudFormToolbar.vue";
import MyCrudFormFeedback from "./MyCrudFormFeedback.vue";
import MyCrudFormFields from "./MyCrudFormFields.vue";
import type { CrudFormProps } from "./form-presentation";
import type { CrudFormSlots } from "./types";
import type { FieldKey, FormVisibleGroup } from "../fields/types";
import { diagnoseCrudSlots } from "./config";
const props = defineProps<CrudFormProps<Model, Entity, Id, C>>();
const embedded = inject(embeddedEditorKey, undefined);
const slots = defineSlots<CrudFormSlots<Model, Entity, Id>>();
async function onFormKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.shiftKey ||
    !(event.ctrlKey || event.metaKey) ||
    event.key.toLowerCase() !== "s"
  )
    return;
  // 事件只由焦点所在的最近表单处理；Teleport 弹层和后台缓存页不会收到此事件。
  if (
    !(event.target instanceof Element) ||
    event.target.closest("[data-crud-keyboard-scope]") !== event.currentTarget
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;
  if (event.target instanceof HTMLElement) event.target.blur();
  await nextTick();
  if (
    props.changePending ||
    props.changeError ||
    crudFormDisabledReason(props.controller, props.readonlyReason)
  )
    return;
  await props.controller.save();
}
const body = ref<HTMLElement>();
const groups = shallowRef<readonly FormVisibleGroup<Model>[]>([]);
const navigation = computed(() => [
  ...groups.value.map((group) => ({
    key: `field:${group.key}`,
    label: group.label,
    field: group.key,
    section: undefined,
    errors: props.controller.state.issues.filter(
      (issue) =>
        !issue.section && issue.field && group.fields.some((key) => key === String(issue.field))
    ).length,
  })),
  ...(props.sections ?? []).map((section) => ({
    key: `section:${section.key}`,
    label: section.label,
    field: undefined,
    section: section.key,
    errors: props.controller.state.issues.filter((issue) => issue.section === section.key).length,
  })),
]);
function navigate(item: (typeof navigation.value)[number]) {
  if (item.field) {
    void props.controller.focusIssue({ field: item.field, message: "" });
    return;
  }
  const section = Array.from(
    body.value?.querySelectorAll<HTMLElement>("[data-crud-section]") ?? []
  ).find((element) => element.dataset.crudSection === item.section);
  section?.scrollIntoView({ block: "start", behavior: "instant" });
  section?.focus({ preventScroll: true });
}
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
.crud-form__section h2 {
  font-size: 15px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.crud-form__navigation {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-top: 14px;
  padding: 2px;
}
.crud-form__navigation button {
  flex-shrink: 0;
  padding: 7px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.crud-form__navigation button:hover,
.crud-form__navigation button:focus-visible {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.crud-form__error-count {
  margin-left: 6px;
  color: var(--el-color-danger);
}
.crud-form__section:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
</style>
