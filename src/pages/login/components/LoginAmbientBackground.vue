<template>
  <div class="login-ambient" aria-hidden="true">
    <VueBitsDotGrid
      class="login-ambient__dot-grid"
      :dot-size="3"
      :gap="31"
      base-color="#c5dcff"
      active-color="#1677ff"
      :proximity="165"
    />
  </div>
</template>

<script setup lang="ts">
import VueBitsDotGrid from "./VueBitsDotGrid.vue";

/**
 * 登录页背景：以 Vue Bits DotGrid 替代普通静态网格。
 * 仅负责装饰与指针反馈，不接受焦点、不阻断品牌区内容。
 */
</script>

<style lang="scss" scoped>
.login-ambient {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(circle at 80% 18%, rgb(53 133 255 / 25%), transparent 32%),
    radial-gradient(circle at 35% 100%, rgb(92 160 255 / 14%), transparent 38%);

  &__dot-grid {
    opacity: 0.62;
    mask-image: radial-gradient(
      ellipse 76% 66% at 67% 45%,
      #000 0%,
      rgb(0 0 0 / 72%) 47%,
      transparent 100%
    );
  }
}

:global(.dark) .login-ambient {
  background:
    radial-gradient(circle at 80% 18%, rgb(46 117 255 / 32%), transparent 32%),
    radial-gradient(circle at 35% 100%, rgb(44 137 255 / 18%), transparent 38%);

  .login-ambient__dot-grid {
    opacity: 0.58;
  }
}

@media (prefers-reduced-motion: reduce), (max-width: 1024px) {
  .login-ambient {
    display: none;
  }
}
</style>
