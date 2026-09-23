<template>
  <Teleport to="body">
    <Transition name="page-guide-fade">
      <div
        v-if="rect"
        class="page-action-guide"
        :style="{ zIndex: layer }"
        aria-live="polite"
        role="status"
      >
        <svg
          v-if="mode === 'spotlight'"
          class="page-action-guide__mask"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <defs>
            <mask :id="maskId" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill="white" />
              <rect
                :x="rect.left - 6"
                :y="rect.top - 6"
                :width="rect.width + 12"
                :height="rect.height + 12"
                rx="8"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            class="page-action-guide__shade"
            :mask="`url(#${maskId})`"
          />
        </svg>
        <div class="page-action-guide__halo" :style="haloStyle" aria-hidden="true" />
        <p class="page-action-guide__hint" :style="hintStyle">{{ message }}</p>
      </div>
    </Transition>
  </Teleport>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowRef,
  useId,
  watch,
} from "vue";
import { useZIndex } from "element-plus";
const props = withDefaults(
  defineProps<{
    /** 公共组件拥有的原生目标包装元素；不使用第三方私有实例。 */
    target: HTMLElement | null;
    /** 目标可点击且页面已就绪；false 时只等待，不高亮禁用操作。 */
    ready: boolean;
    /** halo 局部强调（默认）；spotlight 增加非阻断 SVG 遮罩。 */
    mode?: "halo" | "spotlight";
    /** 一到两行中文说明，例如“点击这里新增客户”。 */
    message: string;
  }>(),
  { mode: "halo" }
);
const emit = defineEmits<{
  /** 点击、Escape、超时或目标失效后结束；不执行业务操作。 */
  finish: [];
}>();
/** 给 SVG 聚光遮罩生成唯一 ID，避免同页多个引导引用错遮罩。 */
const maskId = `page-guide-${useId().replace(/:/g, "")}`;
/** 沿用 Element Plus 的层级分配，避免引导被已有弹层盖住。 */
const { nextZIndex } = useZIndex();
/** 当前引导固定使用的层级，测量位置时不反复提升 z-index。 */
const layer = nextZIndex();
/** 被引导按钮当前在视口中的矩形，光圈和说明都按它定位。 */
const rect = shallowRef<DOMRect>();
/** 当前视口宽度，限制说明框不溢出右边缘。 */
const viewportWidth = ref(window.innerWidth);
/** 当前视口高度，限制说明框不溢出下边缘。 */
const viewportHeight = ref(window.innerHeight);
/** 在目标四周增加 6px 留白生成光圈位置，不改变按钮本身布局。 */
const haloStyle = computed(() =>
  rect.value
    ? {
        left: `${rect.value.left - 6}px`,
        top: `${rect.value.top - 6}px`,
        width: `${rect.value.width + 12}px`,
        height: `${rect.value.height + 12}px`,
      }
    : {}
);
/** 把说明放到目标下方，并限制在视口内留出边距。 */
const hintStyle = computed(() =>
  rect.value
    ? {
        left: `${Math.max(12, Math.min(rect.value.left, viewportWidth.value - 272))}px`,
        top: `${Math.max(12, Math.min(rect.value.bottom + 14, viewportHeight.value - 64))}px`,
      }
    : {}
);
/** 引导是否已经结束，防止重复通知或旧测量继续显示。 */
let disposed = false;
/** 待执行的测量动画帧，同一帧内只安排一次位置更新。 */
let frame = 0;
/** 自动结束引导的计时器，清理时取消，避免页面离开后再触发。 */
let timeout: ReturnType<typeof setTimeout> | undefined;
/** 监听目标按钮自身尺寸变化的观察器，目标切换时重新绑定。 */
let observer: ResizeObserver | undefined;
/** 只在首次发现目标不在视口时主动滚动，避免后续用户滚动被反复拉回。 */
let scrolled = false;
/** 结束并清理引导后通知外层；重复调用不再发出事件。 */
function finish() {
  if (!disposed) {
    cleanup();
    emit("finish");
  }
}
/** 读取可见目标的位置，必要时首次滚动到视口内，并更新光圈和说明的位置。 */
function measure() {
  frame = 0;
  if (disposed || !props.ready) {
    rect.value = undefined;
    return;
  }
  const element = props.target;
  if (!element?.isConnected || !element.getClientRects().length) {
    rect.value = undefined;
    return;
  }
  if (element.closest('[aria-hidden="true"]')) {
    finish();
    return;
  }
  let bounds = element.getBoundingClientRect();
  if (!scrolled && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
    scrolled = true;
    element.scrollIntoView({ block: "nearest", behavior: "instant" });
    bounds = element.getBoundingClientRect();
  }
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
  rect.value = bounds;
}
/** 把滚动、缩放等频繁事件合并为下一帧的位置测量。 */
function schedule() {
  if (!disposed && props.ready && !frame) frame = requestAnimationFrame(measure);
}
/** 用户开始键盘操作或按 Escape 时结束提示，不继续遮挡实际操作。 */
function keydown(event: KeyboardEvent) {
  if (["Escape", "Enter", " ", "Tab"].includes(event.key)) finish();
}
/** 移除尺寸、滚动和输入监听，取消计时器与动画帧，并隐藏光圈。 */
function cleanup() {
  disposed = true;
  if (frame) cancelAnimationFrame(frame);
  if (timeout) clearTimeout(timeout);
  observer?.disconnect();
  window.removeEventListener("resize", schedule);
  document.removeEventListener("scroll", schedule, true);
  document.removeEventListener("transitionend", schedule, true);
  document.removeEventListener("pointerdown", finish, true);
  document.removeEventListener("keydown", keydown, true);
  rect.value = undefined;
}
/** 目标或就绪状态变化时重新观察按钮，等待 DOM 完成后再测量。 */
watch(
  () => [props.target, props.ready] as const,
  async ([target, ready]) => {
    observer?.disconnect();
    if (disposed || !target || !ready) {
      rect.value = undefined;
      return;
    }
    await nextTick();
    if (disposed) return;
    observer = new ResizeObserver(schedule);
    observer.observe(target);
    schedule();
  },
  { immediate: true }
);
window.addEventListener("resize", schedule, { passive: true });
document.addEventListener("scroll", schedule, { capture: true, passive: true });
document.addEventListener("transitionend", schedule, true);
document.addEventListener("pointerdown", finish, true);
document.addEventListener("keydown", keydown, true);
timeout = setTimeout(finish, 5000);
/** 切走缓存标签时结束引导，避免光圈留在其他页面。 */
onDeactivated(finish);
/** 卸载时释放所有监听和计时器，不再显示旧目标。 */
onBeforeUnmount(cleanup);
</script>
<style scoped>
.page-action-guide {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.page-guide-fade-enter-active {
  transition: opacity 160ms ease-out;
}
.page-guide-fade-leave-active {
  transition: opacity 120ms ease-out;
}
.page-guide-fade-enter-from,
.page-guide-fade-leave-to {
  opacity: 0;
}
.page-action-guide__mask {
  position: absolute;
  inset: 0;
}
.page-action-guide__shade {
  fill: rgb(0 0 0 / 28%);
}
:global(html.dark .page-action-guide__shade) {
  fill: rgb(0 0 0 / 40%);
}
.page-action-guide__halo {
  position: absolute;
  border: 2px solid var(--el-color-primary);
  border-radius: 8px;
  box-shadow: 0 0 12px var(--el-color-primary-light-5);
}
.page-action-guide__halo::before,
.page-action-guide__halo::after {
  content: "";
  position: absolute;
  inset: -2px;
  border: 2px solid var(--el-color-primary);
  border-radius: inherit;
  opacity: 0;
  animation: guide-halo 900ms ease-out 3;
}
.page-action-guide__halo::after {
  animation-delay: 180ms;
}
.page-action-guide__hint {
  position: absolute;
  width: max-content;
  max-width: min(260px, calc(100vw - 24px));
  margin: 0;
  padding: 9px 12px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 8px;
  background: var(--el-bg-color-overlay);
  color: var(--el-text-color-primary);
  box-shadow: var(--el-box-shadow-light);
  font-size: 13px;
  line-height: 20px;
}
@keyframes guide-halo {
  from {
    transform: scale(1);
    opacity: 0.55;
  }
  to {
    transform: scale(1.1);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .page-guide-fade-enter-active,
  .page-guide-fade-leave-active {
    transition: none;
  }
  .page-action-guide,
  .page-action-guide__halo::before,
  .page-action-guide__halo::after {
    animation: none;
  }
}
</style>
