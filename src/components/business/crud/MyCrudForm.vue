<template>
  <!-- 用于新增或编辑记录。传入 bindings.form，自动显示字段、保存按钮、草稿提示和错误；section-* 插槽用于添加子表。 -->
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
    <!-- 显示可恢复的草稿和保存错误。自定义页面若替换这里，也需提供恢复、放弃草稿或重试按钮，否则用户可能无法继续保存。 -->
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
        <!-- 显示并校验主表字段。一个编辑页面只放一份 MyCrudFormFields，避免同一字段出现两次。 -->
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
      <!-- 在 section-* 插槽中放联系人、地址等子表。点击保存时会检查并提交全部子表行，包括其他分页的数据。 -->
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
    <!-- 这里负责打开其他模块的弹窗或抽屉。使用 MyCrudForm 的页面无需再添加 MyBusinessPageHost。 -->
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
/** 判断是否位于弹窗或抽屉内；嵌入时不重复显示独立页面的大标题。 */
const embedded = inject(embeddedEditorKey, undefined);
const slots = defineSlots<CrudFormSlots<Model, Entity, Id>>();
/** 处理当前表单内的 Ctrl/Command+S：先结束输入触发联动，再检查能否保存；忽略输入法和长按重复事件。 */
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
  if (crudFormDisabledReason(props.controller, props.readonlyReason, props)) return;
  await props.controller.save();
}
/** 表单正文元素，用于点击分区导航后滚动到对应子表并设置焦点。 */
const body = ref<HTMLElement>();
/** MyCrudFormFields 通知的可见字段分组，用于生成页头导航。 */
const groups = shallowRef<readonly FormVisibleGroup<Model>[]>([]);
/** 合并主字段分组和子表分区，并统计各区错误数量，供导航按钮显示。 */
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
/** 主字段交给表单定位；子表分区滚动到 section 并聚焦，不改变当前填写内容。 */
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
/** 生成 field-* 插槽名，让页面替换单个字段的输入方式。 */
const fieldSlot = (key: FieldKey<Model>) =>
  `field-${key}` as Exclude<keyof typeof slots, "footer" | "header">;
/** 生成 section-* 插槽名，将子表等内容放入配置好的分区。 */
const sectionSlot = (key: string) =>
  `section-${key}` as Exclude<keyof typeof slots, "footer" | "header">;
/** 检查页面传入的字段和分区插槽名，开发时提示拼写错误或未声明的插槽。 */
onMounted(() =>
  diagnoseCrudSlots("MyCrudForm", slots, [
    "header",
    "footer",
    ...props.fields.map((field) => `field-${field.key}`),
    ...(props.sections ?? []).map((section) => `section-${section.key}`),
  ])
);
</script>
<style scoped lang="scss">
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
  width: 100%;
}
.crud-form__fields--structured {
  max-width: 1200px;
}
.crud-form__footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.crud-form__checks {
  font-size: 13px;
}
.crud-form__header {
  display: flex;
  flex-direction: column;
  gap: var(--ui-section-gap);
  margin-bottom: var(--ui-section-gap);
}
.crud-form__section {
  margin-top: var(--ui-section-gap);
}
.crud-form__section h2 {
  margin: 0 0 var(--ui-section-gap);
  font-size: 15px;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.crud-form__navigation {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-top: 12px;
  padding: 2px;
}
.crud-form__navigation button {
  flex-shrink: 0;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--ui-control-radius);
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
