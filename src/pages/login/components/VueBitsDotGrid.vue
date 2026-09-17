<template>
  <div ref="containerRef" class="vue-bits-dot-grid" aria-hidden="true">
    <canvas ref="canvasRef" class="vue-bits-dot-grid__canvas" />
  </div>
</template>

<script setup lang="ts">
import { gsap } from "gsap";

/**
 * Vue Bits DotGrid 的登录页适配版。
 *
 * 鼠标接近时点阵变亮，快速移动或点击时会产生短暂的扩散回弹。
 * 仅用一个低分辨率 Canvas，避免与登录表单争夺渲染资源。
 * @see https://vue-bits.dev/r/DotGrid.json
 */
interface Props {
  /** 点直径（CSS 像素）。 */
  dotSize?: number;
  /** 点之间的间隔（CSS 像素）。 */
  gap?: number;
  /** 静态点颜色。 */
  baseColor?: string;
  /** 指针附近的高亮色。 */
  activeColor?: string;
  /** 指针影响半径（CSS 像素）。 */
  proximity?: number;
}

interface Dot {
  cx: number;
  cy: number;
  x: number;
  y: number;
  animating: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  dotSize: 4,
  gap: 25,
  baseColor: "#9bc3ff",
  activeColor: "#1677ff",
  proximity: 150,
});

const containerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLCanvasElement>();
const dots = ref<Dot[]>([]);
const pointer = { x: -9999, y: -9999, speed: 0, time: 0, lastX: 0, lastY: 0 };
let frame: number | undefined;
let resizeObserver: ResizeObserver | undefined;

function hexToRgb(hex: string): [number, number, number] {
  const matched = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  return matched
    ? [
        Number.parseInt(matched[1], 16),
        Number.parseInt(matched[2], 16),
        Number.parseInt(matched[3], 16),
      ]
    : [22, 119, 255];
}

function buildGrid(): void {
  const container = containerRef.value;
  const canvas = canvasRef.value;
  if (!container || !canvas) return;

  const { width, height } = container.getBoundingClientRect();
  // 背景点阵固定最多 1.25 倍像素密度，控制高分屏上的 Canvas 内存。
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const cell = props.dotSize + props.gap;
  const columns = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const offsetX = (width - (columns - 1) * cell) / 2;
  const offsetY = (height - (rows - 1) * cell) / 2;
  dots.value = Array.from({ length: columns * rows }, (_, index) => {
    const x = index % columns;
    const y = Math.floor(index / columns);
    const cx = offsetX + x * cell;
    const cy = offsetY + y * cell;
    return { cx, cy, x: cx, y: cy, animating: false };
  });
}

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = canvas.width / Math.max(canvas.clientWidth, 1);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  const base = hexToRgb(props.baseColor);
  const active = hexToRgb(props.activeColor);
  const proximitySquared = props.proximity * props.proximity;
  for (const dot of dots.value) {
    const dx = dot.cx - pointer.x;
    const dy = dot.cy - pointer.y;
    const distanceSquared = dx * dx + dy * dy;
    const factor =
      distanceSquared < proximitySquared ? 1 - Math.sqrt(distanceSquared) / props.proximity : 0;
    const radius = props.dotSize / 2 + factor * 1.8;
    context.fillStyle = `rgb(${Math.round(base[0] + (active[0] - base[0]) * factor)} ${Math.round(
      base[1] + (active[1] - base[1]) * factor
    )} ${Math.round(base[2] + (active[2] - base[2]) * factor)})`;
    context.beginPath();
    context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  frame = requestAnimationFrame(draw);
}

function scatter(x: number, y: number, strength: number): void {
  for (const dot of dots.value) {
    const dx = dot.cx - x;
    const dy = dot.cy - y;
    const distance = Math.hypot(dx, dy);
    if (distance > props.proximity || dot.animating) continue;
    dot.animating = true;
    const amount = (1 - distance / props.proximity) * strength;
    gsap
      .timeline({ onComplete: () => (dot.animating = false) })
      .to(dot, {
        x: dot.cx + dx * amount,
        y: dot.cy + dy * amount,
        duration: 0.22,
        ease: "power2.out",
      })
      .to(dot, { x: dot.cx, y: dot.cy, duration: 0.82, ease: "elastic.out(1, 0.55)" });
  }
}

function onPointerMove(event: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const now = performance.now();
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  const elapsed = Math.max(now - pointer.time, 16);
  pointer.speed =
    Math.hypot(event.clientX - pointer.lastX, event.clientY - pointer.lastY) / elapsed;
  pointer.time = now;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
  if (pointer.speed > 0.8) scatter(pointer.x, pointer.y, 0.16);
}

function onClick(event: PointerEvent): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  scatter(event.clientX - rect.left, event.clientY - rect.top, 0.42);
}

onMounted(() => {
  buildGrid();
  draw();
  resizeObserver = new ResizeObserver(buildGrid);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onClick, { passive: true });
});

onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onClick);
  gsap.killTweensOf(dots.value);
});
</script>

<style lang="scss" scoped>
.vue-bits-dot-grid,
.vue-bits-dot-grid__canvas {
  width: 100%;
  height: 100%;
}

.vue-bits-dot-grid__canvas {
  display: block;
}
</style>
