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
const maskId = `page-guide-${useId().replace(/:/g, "")}`;
const { nextZIndex } = useZIndex();
const layer = nextZIndex();
const rect = shallowRef<DOMRect>();
const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);
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
const hintStyle = computed(() =>
  rect.value
    ? {
        left: `${Math.max(12, Math.min(rect.value.left, viewportWidth.value - 272))}px`,
        top: `${Math.max(12, Math.min(rect.value.bottom + 14, viewportHeight.value - 64))}px`,
      }
    : {}
);
let disposed = false;
let frame = 0;
let timeout: ReturnType<typeof setTimeout> | undefined;
let observer: ResizeObserver | undefined;
let scrolled = false;
function finish() {
  if (!disposed) {
    cleanup();
    emit("finish");
  }
}
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
function schedule() {
  if (!disposed && props.ready && !frame) frame = requestAnimationFrame(measure);
}
function keydown(event: KeyboardEvent) {
  if (["Escape", "Enter", " ", "Tab"].includes(event.key)) finish();
}
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
onDeactivated(finish);
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
