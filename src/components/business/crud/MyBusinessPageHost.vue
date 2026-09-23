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
  /** 嵌入表单保存后刷新当前调用方；请求错误仍由列表/详情控制器显示，不再次保存。 */
  afterSave?: () => Promise<void>;
}>();
/** 当前标签页是否可见；缓存页面停用时隐藏弹层，避免覆盖其他页面。 */
const active = ref(true);
/** 关闭弹窗或抽屉失败时的提示，保留原编辑内容供用户继续处理。 */
const closeError = ref("");
/** 本次需要打开的业务页面及显示方式；为空时不创建编辑组件。 */
const current = computed(() => props.presentation.current);
/** 读取本页路由及是否启用缓存，决定离开时保留还是关闭编辑器。 */
const route = useRoute();
/** 读取标签缓存状态，并把未保存检查接入关闭标签的流程。 */
const tags = useTagsViewStore();
/** 创建组件时固定所属路由，避免切换全局路由后替其他标签注册离开检查。 */
const fullPath = route.fullPath;
/** 将弹层内表单的未保存检查注册到当前标签，卸载时用返回函数取消。 */
const unregister = tags.registerLeaveGuard(
  fullPath,
  () => props.presentation.canLeave(),
  () => props.presentation.cancelLeaveApproval()
);
/** 移除当前标签的离开检查，避免标签关闭后仍保留回调。 */
onBeforeUnmount(unregister);
/** 切换到其他标签时暂时隐藏当前页的弹窗和抽屉，不销毁其草稿。 */
onDeactivated(() => {
  active.value = false;
});
/** 重新回到本标签时恢复弹窗/抽屉显示。 */
onActivated(() => {
  active.value = true;
});
/** 进入缓存时允许切页并保留编辑内容；真正离开时先检查是否有未保存修改。 */
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
