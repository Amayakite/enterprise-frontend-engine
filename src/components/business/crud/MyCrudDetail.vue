<template>
  <!-- 显示一条记录的详情、操作按钮和附加页签。传入 bindings.detail 即可使用；tab-* 插槽用于补充子表等内容。 -->
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
     * 用于在详情中打开其他模块的弹窗或抽屉。useCrudView 会随 bindings.detail 提供；省略时不创建容器。
     * @example
     * `<MyCrudDetail v-bind="bindings.detail" />`
     */
    host?: CrudViewEnvironment["host"];
  }
>();
// 提前读取本页字段用到的字典，避免多个字段各自请求同一份选项。
useFieldDictionaries(
  () => props.fields,
  () => props.context
);
const slots = defineSlots<CrudDetailSlots<Model, Entity, Id> & { actions?: () => unknown }>();
// 页面挂载后检查传入的插槽名称；拼错 tab-* 等名称时给出开发提示，避免内容悄悄不显示。
onMounted(() =>
  diagnoseCrudSlots("MyCrudDetail", slots, [
    "actions",
    "footer",
    ...(props.tabs ?? []).map((tab) => `tab-${tab.key}`),
  ])
);
/** 当前打开的页签。新布局的主信息在页签外，默认选第一个附加页签；旧布局默认选“主信息”。 */
const activeTab = ref(props.layout ? (props.tabs?.[0]?.key ?? "main") : "main");
/** 当前记录的只读数据，供详情和插槽使用；尚未加载时为 null，复制后不会让显示代码修改原记录。 */
const model = computed(() =>
  props.controller.state.model === null
    ? null
    : cloneReadonlyModel<Model>(props.controller.state.model)
);
// 切换到另一条记录时重置页签，避免沿用上一条记录正在查看的子表。
watch(
  () => props.controller.state.id,
  () => {
    activeTab.value = props.layout ? (props.tabs?.[0]?.key ?? "main") : "main";
  }
);
// 页签配置变化后，如果原来选中的页签已被移除，就回到默认页签，避免正文为空。
watch(
  () => props.tabs,
  () => {
    if (activeTab.value !== "main" && !props.tabs?.some((tab) => tab.key === activeTab.value))
      activeTab.value = props.layout ? (props.tabs?.[0]?.key ?? "main") : "main";
  }
);
/** 为标题、状态和其他摘要字段提供当前记录及组织等信息；数据未加载时不创建，避免格式化空记录。 */
const environment = computed(() =>
  model.value ? { model: model.value, context: props.context, mode: "edit" as const } : undefined
);
/** 根据 summary 配置挑出页头标题、状态和说明，并保留剩余字段给正文，避免一项内容出现两次。 */
const summaryParts = computed(() =>
  environment.value
    ? resolveDetailSummary(props.fields, environment.value, props.summary)
    : undefined
);
/** 正文要显示的字段：新布局排除已放进页头的字段，旧布局仍显示完整字段列表。 */
const displayFields = computed(() =>
  props.layout ? (summaryParts.value?.fields ?? props.fields) : props.fields
);
/** 将页签 key 转为插槽名，例如 contacts → tab-contacts，让页面在该页签内放联系人等内容。 */
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
