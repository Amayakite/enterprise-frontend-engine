<template>
  <section class="crud-detail" :aria-busy="controller.state.phase === 'loading'">
    <MyCrudDetailToolbar v-bind="props">
      <template #actions><slot name="actions" /></template>
    </MyCrudDetailToolbar>
    <MyCrudDetailFeedback :controller="controller" />
    <el-tabs v-if="model" v-model="activeTab" class="crud-detail__tabs">
      <el-tab-pane label="主信息" name="main">
        <MyDesc
          :model-value="model"
          :fields="fields"
          :context="context"
          :columns="columns"
          :density="density"
        />
      </el-tab-pane>
      <el-tab-pane v-for="tab in tabs" :key="tab.key" :label="tab.label" :name="tab.key">
        <slot :name="tabSlot(tab.key)" v-bind="controller" />
      </el-tab-pane>
    </el-tabs>
    <div class="dialog-footer">
      <slot name="footer" v-bind="controller" />
    </div>
    <MyBusinessPageHost v-if="host" v-bind="host" />
  </section>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number, C">
import { computed, onMounted, ref, watch } from "vue";
import { useFieldDictionaries } from "@/composables/useFieldDictionaries";
import { diagnoseCrudSlots } from "./config";
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
const activeTab = ref("main");
const model = computed(() =>
  props.controller.state.model === null
    ? null
    : cloneReadonlyModel<Model>(props.controller.state.model)
);
watch(
  () => props.controller.state.id,
  () => {
    activeTab.value = "main";
  }
);
watch(
  () => props.tabs,
  () => {
    if (activeTab.value !== "main" && !props.tabs?.some((tab) => tab.key === activeTab.value))
      activeTab.value = "main";
  }
);
const tabSlot = (key: string) => `tab-${key}` as Exclude<keyof typeof slots, "actions" | "footer">;
</script>
<style scoped lang="scss">
.crud-detail {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--content-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
}

.crud-detail__tabs {
  flex: 1;
  min-height: 0;

  :deep(.el-tabs__content) {
    overflow: auto;
  }
}
</style>
