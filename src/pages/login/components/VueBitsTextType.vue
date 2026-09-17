<template>
  <component :is="as" ref="containerRef" class="vue-bits-text-type">
    <span class="vue-bits-text-type__content" :style="{ color: currentColor }">
      {{ displayedText }}
    </span>
    <span v-if="showCursor" ref="cursorRef" class="vue-bits-text-type__cursor">
      {{ cursorCharacter }}
    </span>
  </component>
</template>

<script setup lang="ts">
import { gsap } from "gsap";

/**
 * Vue Bits TextType 的登录页适配版。
 *
 * 逐字展示一组可轮播文本；组件仅用于品牌标语，避免在表单控件上使用影响输入体验。
 * @see https://vue-bits.dev/r/TextType.json
 */
interface Props {
  /** 要循环展示的文案。建议每条长度接近，避免行宽明显跳动。 */
  text: string | string[];
  /** 每个字符的输入间隔（毫秒）。 */
  typingSpeed?: number;
  /** 整句停留时间（毫秒）。 */
  pauseDuration?: number;
  /** 删除每个字符的间隔（毫秒）。 */
  deletingSpeed?: number;
  /** 文案对应颜色；未传时继承父级颜色。 */
  textColors?: string[];
  /** 是否循环轮播。 */
  loop?: boolean;
  /** 是否显示闪烁输入光标。 */
  showCursor?: boolean;
  /** 光标文本。 */
  cursorCharacter?: string;
  /** 渲染标签。 */
  as?: string;
}

const props = withDefaults(defineProps<Props>(), {
  typingSpeed: 54,
  pauseDuration: 2100,
  deletingSpeed: 28,
  textColors: () => [],
  loop: true,
  showCursor: true,
  cursorCharacter: "|",
  as: "span",
});

const displayedText = ref("");
const textIndex = ref(0);
const characterIndex = ref(0);
const deleting = ref(false);
const cursorRef = ref<HTMLElement>();
const containerRef = ref<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;

const textList = computed(() => (Array.isArray(props.text) ? props.text : [props.text]));
const currentColor = computed(() => props.textColors[textIndex.value % props.textColors.length]);

function schedule(callback: () => void, delay: number): void {
  timer = setTimeout(callback, delay);
}

function step(): void {
  const current = textList.value[textIndex.value] ?? "";

  if (deleting.value) {
    if (!displayedText.value) {
      deleting.value = false;
      textIndex.value = (textIndex.value + 1) % textList.value.length;
      characterIndex.value = 0;
      schedule(step, 220);
      return;
    }
    displayedText.value = displayedText.value.slice(0, -1);
    schedule(step, props.deletingSpeed);
    return;
  }

  if (characterIndex.value < current.length) {
    displayedText.value += current[characterIndex.value];
    characterIndex.value += 1;
    schedule(step, props.typingSpeed);
    return;
  }

  if (props.loop && textList.value.length > 1) {
    deleting.value = true;
    schedule(step, props.pauseDuration);
  }
}

onMounted(() => {
  step();
  if (cursorRef.value) {
    gsap.to(cursorRef.value, {
      opacity: 0,
      duration: 0.48,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
    });
  }
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  if (cursorRef.value) gsap.killTweensOf(cursorRef.value);
});
</script>

<style lang="scss" scoped>
.vue-bits-text-type {
  display: inline-flex;
  min-height: 1.75em;
  align-items: baseline;
  letter-spacing: 0.01em;

  &__content {
    font-weight: 650;
  }

  &__cursor {
    display: inline-block;
    margin-left: 3px;
    font-weight: 500;
    color: var(--el-color-primary);
  }
}
</style>
