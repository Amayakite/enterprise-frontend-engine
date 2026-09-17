<template>
  <component
    :is="current.mode === 'drawer' ? MyDrawer : MyDialog"
    v-if="current"
    :model-value="active"
    :title="current.title"
    :width="current.width"
    :before-close="presentation.canLeave"
    :destroy-on-close="false"
    :show-footer="false"
    @update:model-value="requestClose"
  >
    <div class="business-page-host"><component :is="current.component" /></div>
  </component>
</template>
<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, provide, ref } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import MyDialog from "@/components/common/MyDialog.vue";
import MyDrawer from "@/components/common/MyDrawer.vue";
import { useTagsViewStore } from "@/stores/tags-view";
import { embeddedEditorKey } from "./presentation";
import type { BusinessPresentation, EmbeddedEditorContext } from "./presentation";
const props = defineProps<{
  /** useBusinessPage 返回的 presentation；无打开项时不创建表单组件。 */
  presentation: BusinessPresentation;
  /** 嵌入表单保存后刷新当前宿主；请求错误仍由列表/详情控制器显示，不再次保存。 */
  afterSave?: () => Promise<void>;
}>();
const active = ref(true);
const current = computed(() => props.presentation.current);
// getter 在页面加载前读取本次固定目标；宿主只挂载一个编辑页。
const context: EmbeddedEditorContext = {
  get target() {
    if (!current.value) throw new Error("编辑上下文已关闭");
    return current.value.context.target;
  },
  get instanceKey() {
    if (!current.value) throw new Error("编辑上下文已关闭");
    return current.value.context.instanceKey;
  },
  register: (port) => current.value?.context.register(port) ?? (() => {}),
  saved: async (id) => {
    // 先完成宿主后置工作；若抛错，表单仍在，能够保留“已保存但后续失败”的说明。
    const editor = current.value;
    await props.afterSave?.();
    if (editor && current.value === editor) await editor.context.saved(id);
  },
  close: () => props.presentation.close(),
};
provide(embeddedEditorKey, context);
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
  if (!visible && active.value) await props.presentation.close();
}
</script>
<style scoped>
.business-page-host {
  height: min(760px, 76dvh);
  min-height: 240px;
}
</style>
