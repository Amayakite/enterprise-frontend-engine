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

    <div
      v-loading="loading"
      class="my-dialog__body"
      :class="{ 'my-dialog__body--content-scroll': bodyScroll === 'content' }"
      :aria-busy="loading"
    >
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
    /** 可见状态；由调用方通过 v-model 控制，强制关闭不经过 beforeClose。 */
    modelValue: boolean;
    /** 关闭前检查；返回 false 保持可见，支持异步未保存确认。外部强制 v-model=false 不经过此守卫。 */
    beforeClose?: () => boolean | Promise<boolean>;
    /** 对话框标题，也是默认可访问名称；title 插槽可覆盖视觉内容。 */
    title: string;
    /** 宽度，数字单位 px；默认 720px，受 maxWidth 限制。 */
    width?: string | number;
    /** CSS 最大宽度；默认 calc(100vw - 32px)。 */
    maxWidth?: string;
    /** CSS 最大高度；默认 calc(100dvh - 32px)，正文超出时滚动。 */
    maxHeight?: string;
    /** 是否铺满 maxHeight；默认 false 自然高度，全屏时填满视口。 */
    fillHeight?: boolean;
    /** 正文滚动方式：默认 body 由弹窗滚动；content 由内容分配高度并自行滚动，通常搭配 fillHeight。 */
    bodyScroll?: "body" | "content";
    /** 非全屏时距视口顶部的 CSS 距离；默认 16px。 */
    top?: string;
    /** 是否传送到 body；默认 true，避免被父布局裁切。 */
    appendToBody?: boolean;
    /** 关闭动画完成后是否销毁内容；默认 true。 */
    destroyOnClose?: boolean;
    /** 点击遮罩是否请求关闭；默认 false，仍经过 beforeClose。 */
    closeOnClickModal?: boolean;
    /** Esc 是否请求关闭；默认 true，仍经过 beforeClose。 */
    closeOnPressEscape?: boolean;
    /** 是否允许桌面拖动；默认 true，窄屏和全屏下禁用。 */
    draggable?: boolean;
    /** 受控全屏状态；默认 null，使用内部状态；布尔值需配合 update:fullscreen。 */
    fullscreen?: boolean | null;
    /** 是否显示全屏切换按钮；默认 true。 */
    showFullscreen?: boolean;
    /** 是否显示标题关闭按钮；默认 true。 */
    showClose?: boolean;
    /** 是否显示默认操作区；默认 true，传入 footer 插槽时始终显示。 */
    showFooter?: boolean;
    /** 默认操作区是否显示确认按钮；默认 true，不自动关闭或保存。 */
    showConfirm?: boolean;
    /** 默认操作区是否显示取消按钮；默认 true。 */
    showCancel?: boolean;
    /** 正文加载遮罩；默认 false，不自动禁止关闭。 */
    loading?: boolean;
    /** 确认按钮加载态；默认 false，加载期间阻止重复点击。 */
    confirmLoading?: boolean;
    /** 是否禁用确认；默认 false。 */
    confirmDisabled?: boolean;
    /** 禁用确认的原因；默认无，非空时禁用并展示提示。 */
    confirmDisabledReason?: string;
    /** 确认按钮文本；默认“确定”。 */
    confirmText?: string;
    /** 取消按钮文本；默认“取消”。 */
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
   * @example
   * `<MyDialog v-model="visible" title="客户详情" />`
   */
  "update:modelValue": [value: boolean];
  /**
   * 受控全屏状态变更；未传 fullscreen 时组件也维护内部状态。
   * @example
   * `<MyDialog v-model:fullscreen="fullscreen" ... />`
   */
  "update:fullscreen": [value: boolean];
  /**
   * 用户点击确认；组件不自行提交数据，调用方负责保存。
   * @example
   * `<MyDialog @confirm="save" />`
   */
  confirm: [];
  /**
   * 默认取消按钮或公开 close 方法通过守卫后触发；标题关闭和 Esc 沿用 close 事件。
   * @example
   * `<MyDialog @cancel="discard" />`
   */
  cancel: [];
  /** 开始打开时触发。 */
  open: [];
  /** 打开动画结束后触发，可用于聚焦内容。 */
  opened: [];
  /** 开始关闭时触发；不要在此执行需确认的关闭检查。 */
  close: [];
  /** 关闭动画完成且拖动位置复位后触发。 */
  closed: [];
}>();
defineSlots<{
  /** 自定义标题，仍须传 title 作为默认名称。 */
  title?: () => unknown;
  /** 可滚动正文内容。 */
  default?: () => unknown;
  /** 追加标题操作，close 经过关闭守卫。 */
  actions?: (props: {
    /** 请求关闭，仍经过 beforeClose。 */
    close: () => void;
    /** 当前实际全屏状态。 */
    fullscreen: boolean;
    /** 切换全屏并发出 update:fullscreen。 */
    toggleFullscreen: () => void;
  }) => unknown;
  /** 替换默认操作区，调用方负责提交和禁用状态。 */
  footer?: (props: {
    /** 请求关闭，仍经过 beforeClose。 */
    close: () => void;
    /** 当前实际全屏状态。 */
    fullscreen: boolean;
    /** 切换全屏并发出 update:fullscreen。 */
    toggleFullscreen: () => void;
  }) => unknown;
}>();

/** Element Plus 弹窗公开实例，关闭后用于恢复拖动前的位置。 */
const dialog = ref<DialogInstance>();
/** 父页面未控制 fullscreen 时保存本组件自己的全屏状态。 */
const internalFullscreen = ref(false);
/** 仅宽度至少 768px 时允许拖拽，避免窄屏手势与弹窗滚动冲突。 */
const desktop = useMediaQuery("(min-width: 768px)");
/** 统一使用外部全屏状态或内部状态，并通过事件通知全屏切换。 */
const resolvedFullscreen = computed({
  get: () => props.fullscreen ?? internalFullscreen.value,
  set: (value: boolean) => {
    if (props.fullscreen == null) internalFullscreen.value = value;
    emit("update:fullscreen", value);
  },
});
/** 同时满足允许拖动、桌面宽度和非全屏才启用拖拽。 */
const canDrag = computed(() => props.draggable && desktop.value && !resolvedFullscreen.value);
/** 把最大尺寸及铺满高度传给弹窗样式，全屏时使用动态视口高度。 */
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

/** 通知父页面修改弹窗开关，保持 modelValue 单向传入。 */
function updateVisible(value: boolean) {
  emit("update:modelValue", value);
}
/** 防止点击遮罩、关闭按钮等同时启动多次异步关闭确认。 */
let checkingClose = false;
/** 等待 beforeClose 同意后才执行关闭，检查失败或拒绝时保留弹窗内容。 */
async function guardClose(done: () => void) {
  if (checkingClose) return;
  checkingClose = true;
  try {
    if (!props.beforeClose || (await props.beforeClose())) done();
  } finally {
    checkingClose = false;
  }
}
/** 取消按钮也经过关闭检查，通过后通知取消并收起弹窗。 */
function cancel() {
  return guardClose(() => {
    emit("cancel");
    updateVisible(false);
  });
}
/** 切换全屏状态，兼容父页面受控和组件内部管理两种用法。 */
function toggleFullscreen() {
  resolvedFullscreen.value = !resolvedFullscreen.value;
}
/** 关闭动画完成后退出全屏并重置拖动位置，下一次从默认位置打开。 */
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
    outline: var(--ui-focus-ring);
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
.my-dialog__body--content-scroll {
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
