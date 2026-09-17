<template>
  <span ref="rootRef" class="vue-bits-stroke-text" role="img" :aria-label="text">
    <svg
      class="vue-bits-stroke-text__svg"
      :style="{ height: `${Math.round(fontSize * 1.28)}px` }"
      :viewBox="viewBox"
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
    >
      <defs v-if="box">
        <clipPath :id="wipeId" clipPathUnits="userSpaceOnUse">
          <rect ref="wipeRef" :x="box.x" :y="box.y" width="0" :height="box.height" />
        </clipPath>
      </defs>
      <text
        ref="strokeRef"
        x="0"
        y="0"
        fill="none"
        :stroke="strokeColor"
        :stroke-width="strokeWidth"
        stroke-linejoin="round"
        stroke-linecap="round"
        :style="fontStyle"
      >
        <tspan
          v-for="(character, index) in characters"
          :key="`stroke-${index}`"
          data-stroke-character
        >
          {{ character }}
        </tspan>
      </text>
      <text x="0" y="0" :fill="fillColor" :clip-path="`url(#${wipeId})`" :style="fontStyle">
        <tspan v-for="(character, index) in characters" :key="`fill-${index}`">
          {{ character }}
        </tspan>
      </text>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { gsap } from "gsap";

/**
 * Vue Bits StrokeText 的登录页适配版。
 *
 * 先逐字绘制文字描边，再用裁切动画填充标题。此实现保留 Vue Bits 的 SVG 描边表现，
 * 并移除了滚动/悬停等登录页不需要的触发模式。
 * @see https://vue-bits.dev/r/StrokeText.json
 */
interface Props {
  /** 标题内容。 */
  text: string;
  /** 描边色，可使用 CSS 变量。 */
  strokeColor?: string;
  /** 最终文字填充色，可使用 CSS 变量。 */
  fillColor?: string;
  /** SVG 文字字号。 */
  fontSize?: number;
  /** 字重。 */
  fontWeight?: number | string;
  /** 字符间距（px）。 */
  letterSpacing?: number;
  /** 描边宽度。 */
  strokeWidth?: number;
}

interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const props = withDefaults(defineProps<Props>(), {
  strokeColor: "#1677ff",
  fillColor: "#1f3154",
  fontSize: 64,
  fontWeight: 850,
  letterSpacing: -2,
  strokeWidth: 1.1,
});

const rootRef = ref<HTMLElement>();
const strokeRef = ref<SVGTextElement>();
const wipeRef = ref<SVGRectElement>();
const box = ref<TextBox>();
const characters = computed(() => Array.from(props.text));
const wipeId = `login-stroke-wipe-${Math.random().toString(36).slice(2, 10)}`;
const dash = computed(() => Math.max(props.fontSize * 7, 200));
const fontStyle = computed(() => ({
  fontSize: `${props.fontSize}px`,
  fontWeight: props.fontWeight,
  letterSpacing: `${props.letterSpacing}px`,
}));
const viewBox = computed(() => {
  const value = box.value;
  return value
    ? `${value.x} ${value.y} ${value.width} ${value.height}`
    : `0 ${-props.fontSize} 680 ${props.fontSize * 1.28}`;
});

function measure(): void {
  const text = strokeRef.value;
  if (!text) return;
  try {
    const rect = text.getBBox();
    if (!rect.width) return;
    const padding = Math.max(props.strokeWidth * 2, props.fontSize * 0.08);
    box.value = {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
  } catch {
    // 字体尚未加载完成时浏览器可能拒绝测量，下一帧会再次尝试。
  }
}

function animate(): void {
  const root = rootRef.value;
  const currentBox = box.value;
  if (!root || !currentBox) return;
  const strokes = gsap.utils.toArray<SVGElement>(root.querySelectorAll("[data-stroke-character]"));
  if (!strokes.length || !wipeRef.value) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.set(strokes, {
    strokeDasharray: dash.value,
    strokeDashoffset: reducedMotion ? 0 : dash.value,
  });
  gsap.set(wipeRef.value, { attr: { width: reducedMotion ? currentBox.width : 0 } });
  if (reducedMotion) return;
  gsap
    .timeline()
    .to(strokes, { strokeDashoffset: 0, duration: 1.05, ease: "power2.out", stagger: 0.055 })
    .to(
      wipeRef.value,
      { attr: { width: currentBox.width }, duration: 0.48, ease: "power2.inOut" },
      0.9
    );
}

onMounted(async () => {
  measure();
  await document.fonts?.ready;
  measure();
  requestAnimationFrame(animate);
});

onBeforeUnmount(() => {
  if (rootRef.value) gsap.killTweensOf(rootRef.value.querySelectorAll("*"));
});
</script>

<style lang="scss" scoped>
.vue-bits-stroke-text {
  display: block;
  width: 100%;
  line-height: 0;

  &__svg {
    display: block;
    width: 100%;
    overflow: visible;
  }
}
</style>
