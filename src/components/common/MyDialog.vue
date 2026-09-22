<template>
  <el-dialog
    ref="dialog"
    :model-value="modelValue"
    :before-close="guardClose"
    :title="title"
    :width="width"
    :top="top"
    :append-to-body="appendToBody"
    :destroy-on-close="destroyOnClose"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    :draggable="canDrag"
    :overflow="false"
    :fullscreen="resolvedFullscreen"
    :show-close="false"
    :style="dialogStyle"
    class="my-dialog"
    @update:model-value="updateVisible"
    @open="emit('open')"
    @opened="emit('opened')"
    @close="emit('close')"
    @closed="closed"
  >
    <template #header="{ close, titleId, titleClass }">
      <div class="my-dialog__header">
        <div :id="titleId" :class="[titleClass, 'my-dialog__title']">
          <slot name="title">{{ title }}</slot>
        </div>
        <div class="my-dialog__header-actions">
          <slot
            name="actions"
            :close="close"
            :fullscreen="resolvedFullscreen"
            :toggle-fullscreen="toggleFullscreen"
          />
          <el-tooltip
            v-if="showFullscreen"
            :content="resolvedFullscreen ? '还原窗口' : '全屏显示'"
            placement="bottom"
          >
            <button
              type="button"
              class="my-dialog__icon-button"
              :aria-label="resolvedFullscreen ? '还原窗口' : '全屏显示'"
              :title="resolvedFullscreen ? '还原窗口' : '全屏显示'"
              @click="toggleFullscreen"
            >
              <span
                aria-hidden="true"
                :class="resolvedFullscreen ? 'i-svg:fullscreen-exit' : 'i-svg:fullscreen'"
              />
            </button>
          </el-tooltip>
          <el-tooltip v-if="showClose" content="关闭" placement="bottom">
            <button
              type="button"
              class="my-dialog__icon-button"
              aria-label="关闭"
              title="关闭"
              @click="close"
            >
              <span aria-hidden="true" class="i-svg:close" />
            </button>
          </el-tooltip>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="my-dialog__body" :aria-busy="loading">
      <slot />
    </div>

    <template v-if="showFooter || $slots.footer" #footer>
      <slot
        name="footer"
        :close="cancel"
        :fullscreen="resolvedFullscreen"
        :toggle-fullscreen="toggleFullscreen"
      >
        <div class="my-dialog__footer">
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
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import type { CSSProperties } from "vue";
import type { DialogInstance } from "element-plus";
import ActionButton from "@/components/business/ActionButton.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** 关闭前检查；返回 false 保持可见，支持异步未保存确认。外部强制 v-model=false 不经过此守卫。 */
    beforeClose?: () => boolean | Promise<boolean>;
    title: string;
    width?: string | number;
    maxWidth?: string;
    maxHeight?: string;
    /** 是否铺满 maxHeight；默认 false 自然高度，全屏时填满视口。 */
    fillHeight?: boolean;
    top?: string;
    appendToBody?: boolean;
    destroyOnClose?: boolean;
    closeOnClickModal?: boolean;
    closeOnPressEscape?: boolean;
    draggable?: boolean;
    fullscreen?: boolean | null;
    showFullscreen?: boolean;
    showClose?: boolean;
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
    width: "720px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100dvh - 32px)",
    top: "16px",
    appendToBody: true,
    destroyOnClose: true,
    closeOnClickModal: false,
    closeOnPressEscape: true,
    draggable: true,
    fullscreen: null,
    showFullscreen: true,
    showClose: true,
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
   * 对话框开关状态（v-model）。
   * @example `<MyDialog v-model="visible" title="客户详情" />`
   */
  "update:modelValue": [value: boolean];
  /**
   * 受控全屏状态变更；未传 fullscreen 时组件也维护内部状态。
   * @example `<MyDialog v-model:fullscreen="fullscreen" ... />`
   */
  "update:fullscreen": [value: boolean];
  /**
   * 用户点击确认；组件不自行提交数据，宿主负责保存。
   * @example `<MyDialog @confirm="save" />`
   */
  confirm: [];
  /**
   * 用户取消或点击关闭；事件后组件将 v-model 设为 false。
   * @example `<MyDialog @cancel="discard" />`
   */
  cancel: [];
  open: [];
  opened: [];
  close: [];
  closed: [];
}>();
defineSlots<{
  title?: () => unknown;
  default?: () => unknown;
  actions?: (props: {
    close: () => void;
    fullscreen: boolean;
    toggleFullscreen: () => void;
  }) => unknown;
  footer?: (props: {
    close: () => void;
    fullscreen: boolean;
    toggleFullscreen: () => void;
  }) => unknown;
}>();

const dialog = ref<DialogInstance>();
const internalFullscreen = ref(false);
const desktop = useMediaQuery("(min-width: 768px)");
const resolvedFullscreen = computed({
  get: () => props.fullscreen ?? internalFullscreen.value,
  set: (value: boolean) => {
    if (props.fullscreen == null) internalFullscreen.value = value;
    emit("update:fullscreen", value);
  },
});
const canDrag = computed(() => props.draggable && desktop.value && !resolvedFullscreen.value);
const dialogStyle = computed(
  () =>
    ({
      "--my-dialog-max-width": props.maxWidth,
      "--my-dialog-max-height": props.maxHeight,
      height: props.fillHeight
        ? resolvedFullscreen.value
          ? "100dvh"
          : props.maxHeight
        : undefined,
    }) as CSSProperties
);

function updateVisible(value: boolean) {
  emit("update:modelValue", value);
}
let checkingClose = false;
async function guardClose(done: () => void) {
  if (checkingClose) return;
  checkingClose = true;
  try {
    if (!props.beforeClose || (await props.beforeClose())) done();
  } finally {
    checkingClose = false;
  }
}
function cancel() {
  return guardClose(() => {
    emit("cancel");
    updateVisible(false);
  });
}
function toggleFullscreen() {
  resolvedFullscreen.value = !resolvedFullscreen.value;
}
async function closed() {
  resolvedFullscreen.value = false;
  await nextTick();
  dialog.value?.resetPosition();
  emit("closed");
}
defineExpose({
  close: cancel,
  resetPosition: () => dialog.value?.resetPosition(),
  toggleFullscreen,
});
</script>

<style scoped lang="scss">
:global(.my-dialog.el-dialog) {
  display: flex;
  flex-direction: column;
  max-width: var(--my-dialog-max-width);
  max-height: var(--my-dialog-max-height);
  overflow: hidden;
}
:global(.my-dialog.el-dialog.is-fullscreen) {
  max-width: none;
  max-height: none;
}
:global(.my-dialog > .el-dialog__header) {
  padding: 0;
}
:global(.my-dialog > .el-dialog__body) {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
:global(.my-dialog > .el-dialog__footer) {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.my-dialog__header {
  display: flex;
  min-height: 48px;
  gap: 12px;
  align-items: center;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.my-dialog__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--el-font-size-large);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.my-dialog__header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
  align-items: center;
}
.my-dialog__icon-button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--el-border-radius-base);
  align-items: center;
  justify-content: center;
  transition:
    color 0.15s,
    background-color 0.15s;
  span {
    width: 16px;
    height: 16px;
  }
  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }
  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 1px;
  }
}
.my-dialog__body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  overflow: auto;
}
.my-dialog__footer {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
@media (max-width: 767px) {
  :global(.my-dialog.el-dialog:not(.is-fullscreen)) {
    max-width: calc(100vw - 20px);
  }
  .my-dialog__header {
    min-height: 44px;
    padding-left: 12px;
  }
  .my-dialog__body {
    padding: 12px;
  }
}
</style>
