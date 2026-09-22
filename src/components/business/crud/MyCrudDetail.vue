<template>
  <MyCrudLayout
    :layout="layout"
    class="crud-detail"
    :aria-busy="controller.state.phase === 'loading'"
  >
    <template #toolbar>
      <div v-if="layout" class="crud-detail__heading">
        <div class="crud-detail__identity">
          <div class="crud-detail__title-row">
            <h1>
              <FieldDisplay
                v-if="
                  summaryParts?.title &&
                  environment &&
                  !isEmptyValue(environment.model[summaryParts.title.key])
                "
                :field="summaryParts.title"
                :env="environment"
              />
              <template v-else>{{ entityLabel }}详情</template>
            </h1>
            <template v-if="environment">
              <span
                v-for="field in summaryParts?.status"
                :key="field.key"
                class="crud-detail__status"
              >
                <FieldDisplay :field="field" :env="environment" />
              </span>
            </template>
          </div>
          <div v-if="environment && summaryParts?.description.length" class="crud-detail__subtitle">
            <span v-for="field in summaryParts.description" :key="field.key">
              {{ field.label }}：
              <FieldDisplay :field="field" :env="environment" />
            </span>
          </div>
        </div>
        <div class="crud-detail__commands">
          <MyCrudDetailToolbar v-bind="props" :can-edit="!slots.actions && canEdit">
            <template #actions><slot name="actions" /></template>
          </MyCrudDetailToolbar>
        </div>
      </div>
      <MyCrudDetailToolbar v-else v-bind="props" :can-edit="!slots.actions && canEdit">
        <template #actions><slot name="actions" /></template>
      </MyCrudDetailToolbar>
    </template>
    <MyCrudDetailFeedback :controller="controller" />
    <template v-if="model">
      <MyDesc
        v-if="layout"
        :model-value="model"
        :fields="displayFields"
        :context="context"
        :columns="columns"
        :density="density"
        appearance="plain"
      />
      <el-tabs v-if="!layout || tabs?.length" v-model="activeTab" class="crud-detail__tabs">
        <el-tab-pane v-if="!layout" label="主信息" name="main">
          <MyDesc
            :model-value="model"
            :fields="fields"
            :context="context"
            :columns="columns"
            :density="density"
          />
        </el-tab-pane>
        <el-tab-pane v-for="tab in tabs" :key="tab.key" :label="tab.label" :name="tab.key">
          <div class="crud-detail__tab-body">
            <slot :name="tabSlot(tab.key)" v-bind="controller" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <template v-if="slots.footer" #footer><slot name="footer" v-bind="controller" /></template>
    <MyBusinessPageHost v-if="host" v-bind="host" />
  </MyCrudLayout>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number, C">
import { computed, onMounted, ref, watch } from "vue";
import { useFieldDictionaries } from "@/composables/useFieldDictionaries";
import { diagnoseCrudSlots } from "./config";
import MyCrudLayout from "./MyCrudLayout.vue";
import FieldDisplay from "../fields/FieldDisplay.vue";
import { resolveDetailSummary } from "./detail-summary";
import { isEmptyValue } from "@/utils/validate";
import MyDesc from "@/components/business/MyDesc.vue";
import MyCrudDetailToolbar from "./MyCrudDetailToolbar.vue";
import MyCrudDetailFeedback from "./MyCrudDetailFeedback.vue";
import MyBusinessPageHost from "./MyBusinessPageHost.vue";
import type { CrudDetailProps } from "./form-presentation";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import type { CrudDetailSlots } from "./types";
import type { CrudViewEnvironment } from "./crud-page";
const props = defineProps<
  CrudDetailProps<Model, Entity, Id, C> & {
    /**
     * 当前详情自动消费的弹窗/抽屉宿主；标准 useCrudView 会提供，独立详情省略时不挂载。
     * @example
     * `<MyCrudDetail v-bind="bindings.detail" />`
     */
    host?: CrudViewEnvironment["host"];
  }
>();
useFieldDictionaries(
  () => props.fields,
  () => props.context
);
const slots = defineSlots<CrudDetailSlots<Model, Entity, Id> & { actions?: () => unknown }>();
onMounted(() =>
  diagnoseCrudSlots("MyCrudDetail", slots, [
    "actions",
    "footer",
    ...(props.tabs ?? []).map((tab) => `tab-${tab.key}`),
  ])
);
const activeTab = ref(props.layout ? (props.tabs?.[0]?.key ?? "main") : "main");
const model = computed(() =>
  props.controller.state.model === null
    ? null
    : cloneReadonlyModel<Model>(props.controller.state.model)
);
watch(
  () => props.controller.state.id,
  () => {
    activeTab.value = props.layout ? (props.tabs?.[0]?.key ?? "main") : "main";
  }
);
watch(
  () => props.tabs,
  () => {
    if (activeTab.value !== "main" && !props.tabs?.some((tab) => tab.key === activeTab.value))
      activeTab.value = props.layout ? (props.tabs?.[0]?.key ?? "main") : "main";
  }
);
const environment = computed(() =>
  model.value ? { model: model.value, context: props.context, mode: "edit" as const } : undefined
);
const summaryParts = computed(() =>
  environment.value
    ? resolveDetailSummary(props.fields, environment.value, props.summary)
    : undefined
);
const displayFields = computed(() =>
  props.layout ? (summaryParts.value?.fields ?? props.fields) : props.fields
);
const tabSlot = (key: string) => `tab-${key}` as Exclude<keyof typeof slots, "actions" | "footer">;
</script>
<style scoped>
.crud-detail__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 18px 24px;
}
.crud-detail__identity {
  flex: 1 1 240px;
  min-width: 0;
}
.crud-detail__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.crud-detail__title-row h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.crud-detail__status {
  padding: 3px 9px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.crud-detail__subtitle {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.crud-detail__commands {
  max-width: 100%;
}
.crud-detail__tabs {
  min-width: 0;
}
.crud-detail__tab-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
