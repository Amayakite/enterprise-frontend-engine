<template>
  <component
    :is="current.mode === 'drawer' ? MyDrawer : MyDialog"
    v-if="current"
    :model-value="active"
    :title="current.title"
    :width="current.width"
    v-bind="current.mode === 'dialog' ? { fillHeight: true } : {}"
    :before-close="presentation.canLeave"
    :destroy-on-close="false"
    :show-footer="false"
    @update:model-value="requestClose"
  >
    <div class="business-page-host" :class="`business-page-host--${current.mode}`">
      <MyFeedback v-if="closeError" :message="closeError" />
      <MyBusinessPageContent :key="current.key" :editor="current" :after-save="afterSave" />
    </div>
  </component>
</template>
<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, ref } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import MyDialog from "@/components/common/MyDialog.vue";
import MyDrawer from "@/components/common/MyDrawer.vue";
import { useTagsViewStore } from "@/stores/tags-view";
import MyFeedback from "../feedback/MyFeedback.vue";
import MyBusinessPageContent from "./MyBusinessPageContent.vue";
import type { BusinessPresentation } from "./presentation";
const props = defineProps<{
  /** useBusinessPage 返回的 presentation；无打开项时不创建表单组件。 */
  presentation: BusinessPresentation;
  /** 嵌入表单保存后刷新当前宿主；请求错误仍由列表/详情控制器显示，不再次保存。 */
  afterSave?: () => Promise<void>;
}>();
const active = ref(true);
const closeError = ref("");
const current = computed(() => props.presentation.current);
const route = useRoute();
const tags = useTagsViewStore();
const fullPath = route.fullPath;
const unregister = tags.registerLeaveGuard(
  fullPath,
  () => props.presentation.canLeave(),
  () => props.presentation.cancelLeaveApproval()
);
onBeforeUnmount(unregister);
onDeactivated(() => {
  active.value = false;
});
onActivated(() => {
  active.value = true;
});
onBeforeRouteLeave(() =>
  route.meta.keepAlive && tags.cachedViews.includes(fullPath) ? true : props.presentation.canLeave()
);
/** X、遮罩、Escape 共用表单离开守卫；不直接改 v-model 丢失输入。 */
async function requestClose(visible: boolean) {
  if (!visible && active.value) {
    closeError.value = "";
    try {
      await props.presentation.close();
    } catch (error) {
      closeError.value = error instanceof Error ? error.message : "页面未关闭，请重试";
    }
  }
}
</script>
<style scoped>
.business-page-host {
  height: 100%;
  min-height: 0;
}
</style>
