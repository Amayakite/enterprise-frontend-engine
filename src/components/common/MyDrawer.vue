<template>
  <el-drawer
    :model-value="modelValue"
    :before-close="guardClose"
    :title="title"
    :size="width"
    :append-to-body="appendToBody"
    :destroy-on-close="destroyOnClose"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    class="my-drawer"
    @update:model-value="updateVisible"
  >
    <div v-loading="loading" class="my-drawer__body" :aria-busy="loading">
      <slot />
    </div>
    <template v-if="showFooter || $slots.footer" #footer>
      <slot name="footer" :close="cancel">
        <div class="my-drawer__footer">
          <el-button v-if="showCancel" @click="cancel">{{ cancelText }}</el-button>
          <ActionButton
            v-if="showConfirm"
            :label="confirmText"
            tone="primary"
            :link="false"
            :disabled="confirmDisabled"
            :disabled-reason="confirmDisabledReason"
            :loading="confirmLoading"
            @click="emit('confirm')"
          />
        </div>
      </slot>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import ActionButton from "@/components/business/ActionButton.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** X、Escape 和取消关闭前检查；false 保持打开，支持异步未保存确认。 */
    beforeClose?: () => boolean | Promise<boolean>;
    title: string;
    width?: string | number;
    appendToBody?: boolean;
    destroyOnClose?: boolean;
    closeOnClickModal?: boolean;
    closeOnPressEscape?: boolean;
    showFooter?: boolean;
    showConfirm?: boolean;
    showCancel?: boolean;
    loading?: boolean;
    confirmLoading?: boolean;
    confirmDisabled?: boolean;
    confirmDisabledReason?: string;
    confirmText?: string;
    cancelText?: string;
  }>(),
  {
    width: "min(720px, 92vw)",
    appendToBody: true,
    destroyOnClose: true,
    closeOnClickModal: false,
    closeOnPressEscape: true,
    showFooter: true,
    showConfirm: true,
    showCancel: true,
    loading: false,
    confirmLoading: false,
    confirmDisabled: false,
    confirmText: "确定",
    cancelText: "取消",
  }
);
const emit = defineEmits<{
  /**
   * 抽屉开关状态（v-model）。
   * @example `<MyDrawer v-model="visible" title="编辑客户" />`
   */
  "update:modelValue": [value: boolean];
  /**
   * 用户确认；组件不自行提交数据，调用方负责保存。
   * @example `<MyDrawer @confirm="save" />`
   */
  confirm: [];
  /**
   * 用户取消或关闭抽屉；事件后组件会将 v-model 设为 false。
   * @example `<MyDrawer @cancel="resetDraft" />`
   */
  cancel: [];
}>();
defineSlots<{
  default?: () => unknown;
  footer?: (props: { close: () => void }) => unknown;
}>();

/** 通过事件通知父页面改变抽屉开关，不直接改传入值。 */
function updateVisible(value: boolean) {
  emit("update:modelValue", value);
}
/** 锁住正在执行的关闭确认，避免连续点击导致重复询问。 */
let checkingClose = false;
/** 先执行业务关闭检查，允许后才真正关闭抽屉，保护未保存输入。 */
async function guardClose(done: () => void) {
  if (checkingClose) return;
  checkingClose = true;
  try {
    if (!props.beforeClose || (await props.beforeClose())) done();
  } finally {
    checkingClose = false;
  }
}
/** 取消按钮沿用同一关闭检查，通过后通知取消并更新开关。 */
function cancel() {
  return guardClose(() => {
    emit("cancel");
    updateVisible(false);
  });
}
</script>

<style scoped lang="scss">
:global(.my-drawer .el-drawer__header) {
  min-height: 44px;
  margin: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
:global(.my-drawer .el-drawer__body) {
  display: flex;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
:global(.my-drawer .el-drawer__footer) {
  padding: 8px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.my-drawer__body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--ui-panel-padding);
  overflow: auto;
}
.my-drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
