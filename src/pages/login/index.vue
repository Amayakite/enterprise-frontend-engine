<template>
  <div class="login-page">
    <div class="login-toolbar">
      <ThemeSwitch />
    </div>

    <div class="login-layout">
      <div class="login-brand">
        <component :is="LoginAmbientBackground" v-if="showAmbient" />

        <div class="login-brand__header">
          <el-image :src="logo" class="login-brand__logo" />
          <div class="login-brand__identity">
            <span class="login-brand__name">{{ appConfig.title }}</span>
            <span class="login-brand__version">v{{ appConfig.version }}</span>
          </div>
        </div>

        <div class="login-brand__hero">
          <div class="login-brand__main">
            <el-tag class="login-brand__tag" type="primary" effect="plain" round>
              <span class="login-brand__tag-dot" />
              企业级解决方案
            </el-tag>
            <h1 class="login-brand__title">
              <VueBitsStrokeText
                text="企业级管理系统"
                stroke-color="var(--login-title-stroke)"
                fill-color="var(--login-title-fill)"
                :font-size="64"
                :font-weight="850"
                :stroke-width="1.1"
              />
            </h1>
            <div class="login-brand__typed-desc">
              <VueBitsTextType
                :text="['安全可靠的业务协同', '清晰可控的数据治理', '更高效的企业运营']"
                :text-colors="['#1677ff', '#3878ec', '#536fd8']"
                :typing-speed="62"
                :pause-duration="2300"
              />
            </div>
          </div>
          <div class="login-brand__features">
            <div class="login-brand__feature">
              <span class="login-brand__feature-mark">
                <span class="login-brand__feature-icon i-svg:security" />
              </span>
              <span class="login-brand__feature-text">安全可靠</span>
            </div>
            <div class="login-brand__feature">
              <span class="login-brand__feature-mark">
                <el-icon class="login-brand__feature-icon"><Clock /></el-icon>
              </span>
              <span class="login-brand__feature-text">高效稳定</span>
            </div>
            <div class="login-brand__feature">
              <span class="login-brand__feature-mark">
                <span class="login-brand__feature-icon i-svg:flexible" />
              </span>
              <span class="login-brand__feature-text">灵活扩展</span>
            </div>
          </div>
        </div>
      </div>

      <div class="login-card">
        <div class="login-card__inner">
          <transition name="fade-slide" mode="out-in">
            <div key="login" class="login-card__form">
              <h2 class="login-card__title">欢迎回来</h2>
              <p class="login-card__desc">请完成身份验证后进入系统</p>

              <el-form
                ref="loginFormRef"
                :model="loginFormData"
                :rules="loginRules"
                size="large"
                :validate-on-rule-change="false"
              >
                <el-form-item prop="username">
                  <el-input
                    v-model.trim="loginFormData.username"
                    placeholder="用户名"
                    :prefix-icon="UserIcon"
                  />
                </el-form-item>

                <el-tooltip :visible="isCapsLock" content="大写锁定已开启" placement="right">
                  <el-form-item prop="password">
                    <el-input
                      v-model.trim="loginFormData.password"
                      placeholder="密码"
                      type="password"
                      show-password
                      :prefix-icon="LockIcon"
                      @keyup="checkCapsLock"
                      @keyup.enter="handleLoginSubmit"
                    />
                  </el-form-item>
                </el-tooltip>

                <div class="login-options">
                  <el-checkbox v-model="loginFormData.rememberMe">记住我</el-checkbox>
                </div>

                <el-button
                  :loading="loading"
                  type="primary"
                  size="large"
                  class="login-btn"
                  @click="handleLoginSubmit"
                >
                  登录
                </el-button>
              </el-form>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "LoginPage", inheritAttrs: false });

import { Clock, Lock, User } from "@element-plus/icons-vue";
import type { FormInstance } from "element-plus";
import type { LoginRequest } from "@/api/auth";
import router from "@/router";
import { useUserStore } from "@/stores";
import { AuthStorage } from "@/utils/auth";
import { appConfig } from "@/config/app";
import ThemeSwitch from "@/pages/layout/components/ThemeSwitch.vue";
import logo from "@/assets/images/logo.png";
import VueBitsStrokeText from "@/pages/login/components/VueBitsStrokeText.vue";
import VueBitsTextType from "@/pages/login/components/VueBitsTextType.vue";

const LoginAmbientBackground = defineAsyncComponent(
  () => import("@/pages/login/components/LoginAmbientBackground.vue")
);

const userStore = useUserStore();
const route = useRoute();

const loginFormRef = ref<FormInstance>();
const loading = ref(false);
const isCapsLock = ref(false);
// 让表单与品牌信息先完成首次绘制，再按需下载和挂载背景装饰块。
const showAmbient = ref(false);

const UserIcon = markRaw(User);
const LockIcon = markRaw(Lock);

const loginFormData = ref<LoginRequest>({
  username: import.meta.env.DEV && import.meta.env.VITE_MOCK_DEV_SERVER === "true" ? "admin" : "",
  password: import.meta.env.DEV && import.meta.env.VITE_MOCK_DEV_SERVER === "true" ? "123456" : "",
  rememberMe: AuthStorage.getRememberMe(),
});

const loginRules = computed(() => ({
  username: [{ required: true, trigger: "blur", message: "请输入用户名" }],
  password: [
    { required: true, trigger: "blur", message: "请输入密码" },
    { min: 6, message: "密码不能少于6位", trigger: "blur" },
  ],
}));

async function handleLoginSubmit() {
  const valid = await loginFormRef.value?.validate().then(
    () => true,
    () => false
  );
  if (!valid) return;

  loading.value = true;
  try {
    await userStore.login(loginFormData.value);
    const redirectPath = (route.query.redirect as string) || "/";
    await router.push(decodeURIComponent(redirectPath));
  } catch {
    // 请求层统一显示登录错误，保留表单供用户重试。
  } finally {
    loading.value = false;
  }
}

function checkCapsLock(event: KeyboardEvent) {
  if (event instanceof KeyboardEvent) {
    isCapsLock.value = event.getModifierState("CapsLock");
  }
}

onMounted(() => {
  requestAnimationFrame(() => {
    showAmbient.value = true;
  });
});
</script>

<style lang="scss" scoped>
$bg: #f8fafc;
$text-primary: #273248;
$text-secondary: #667085;
$text-muted: #98a2b3;
$input-h: 44px;

.login-page {
  position: relative;
  display: flex;
  min-height: 100vh;
  overflow: auto;
  background: $bg;
}

.login-toolbar {
  position: fixed;
  top: 28px;
  right: 32px;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;

  :deep(*) {
    cursor: pointer;
  }
}

.login-layout {
  display: flex;
  flex: 1;
  min-height: 100%;
}

.login-brand {
  --login-title-stroke: #1677ff;
  --login-title-fill: #1f3154;

  position: relative;
  display: flex;
  flex: 0 0 65%;
  flex-direction: column;
  min-height: 100vh;
  padding: 28px 64px 48px;
  overflow: hidden;
  background: linear-gradient(135deg, #fbfcff 0%, #f2f6ff 52%, #eaf1ff 100%);
  animation: login-pane-in 0.36s ease-out both;

  &__header,
  &__hero {
    position: relative;
    z-index: 1;
  }

  &__header {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  &__logo {
    width: 42px;
    height: 42px;
  }

  &__identity {
    display: inline-flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  &__name {
    font-size: 24px;
    font-weight: 600;
    line-height: 1;
    color: $text-primary;
  }

  &__version {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--el-color-primary) 13%, transparent);
    border-radius: 999px;
  }

  &__hero {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    width: min(720px, 100%);
    padding: 20px 0 88px;
  }

  &__main {
    width: 100%;
  }

  &__tag {
    gap: 8px;
    height: 28px;
    padding: 0 13px 0 11px;
    margin-bottom: 18px;
    font-weight: 700;
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
    border-color: color-mix(in srgb, var(--el-color-primary) 14%, transparent);

    :deep(.el-tag__content) {
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }
  }

  &__tag-dot {
    display: inline-block;
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    background: var(--el-color-primary);
    border-radius: 50%;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  }

  &__title {
    margin: 0 0 18px;
    font-size: 46px;
    font-weight: 800;
    line-height: 1.18;
    color: #222b3a;
    letter-spacing: 0;
  }

  &__desc {
    max-width: 560px;
    margin: 0;
    font-size: 16px;
    line-height: 1.75;
    color: $text-secondary;
  }

  &__typed-desc {
    min-height: 32px;
    margin: 0;
    font-size: 17px;
    line-height: 1.75;
    color: $text-secondary;
  }

  &__features {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    margin-top: 28px;
  }

  &__feature {
    position: relative;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    height: 28px;
    padding: 0 13px;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    background: transparent;

    &:first-child {
      padding-left: 0;
    }

    &:not(:last-child)::after {
      position: absolute;
      top: 7px;
      right: 0;
      width: 1px;
      height: 14px;
      content: "";
      background: rgba(39 50 72 / 12%);
    }
  }

  &__feature-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--el-color-primary) 10%, transparent);
    border-radius: 6px;
  }

  &__feature-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    color: var(--el-color-primary);
  }

  &__feature-text {
    line-height: 1;
    white-space: nowrap;
  }
}

.login-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 0 0 35%;
  flex-direction: column;
  align-items: center;
  padding: 0 0 32px;
  background: linear-gradient(135deg, #f8faff 0%, #fff 100%);
  animation: login-pane-in 0.36s ease-out 0.04s both;

  &__inner {
    box-sizing: border-box;
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    max-width: 430px;
    padding: 0 20px;
  }

  &__form {
    width: 100%;
  }

  &__title {
    margin: 0 0 4px;
    font-size: 34px;
    font-weight: 750;
    line-height: 1.1;
    color: $text-primary;
    letter-spacing: 0;
  }

  &__desc {
    margin: 8px 0 24px;
    font-size: 14px;
    color: $text-muted;
  }
}

:deep(.el-form-item) {
  margin-bottom: 14px;
}

:deep(.el-input__wrapper) {
  height: $input-h;
}

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
  font-size: 14px;
  color: $text-secondary;

  &__link {
    font-weight: 500;
    color: var(--el-color-primary);
    cursor: pointer;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.8;
    }
  }
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 8px;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--el-color-primary) 18%, transparent);

  &:hover {
    box-shadow: 0 14px 28px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
  }

  &:focus,
  &:focus-visible {
    outline: none;
  }
}

.login-footer {
  flex-shrink: 0;
  font-size: 12px;
  color: $text-muted;
}

.dark .login-page {
  background: #0b1020;
}

.dark .login-brand {
  --login-title-stroke: #7cb2ff;
  --login-title-fill: rgb(255 255 255 / 90%);

  background: linear-gradient(135deg, #0b1324 0%, #101d33 55%, #192a46 100%);

  &__name {
    color: rgb(255 255 255 / 86%);
  }

  &__version {
    color: rgb(167 190 255 / 92%);
    background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
  }

  &__tag {
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
    border-color: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  }

  &__title {
    color: rgb(255 255 255 / 90%);
  }

  &__desc {
    color: rgb(226 232 240 / 62%);
  }

  &__feature {
    color: rgb(255 255 255 / 76%);

    &:not(:last-child)::after {
      background: rgba(255 255 255 / 12%);
    }
  }

  &__feature-mark {
    background: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
    border-color: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  }
}

.dark .login-card {
  background: linear-gradient(135deg, #111827, #0b1020);

  &__title {
    color: rgb(255 255 255 / 85%);
  }

  &__desc {
    color: rgb(255 255 255 / 30%);
  }
}

.dark .login-footer {
  color: rgb(255 255 255 / 15%);
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@keyframes login-pane-in {
  from {
    opacity: 0;
    filter: blur(4px);
  }

  to {
    opacity: 1;
    filter: blur(0);
  }
}

@media (max-width: 1024px) {
  .login-layout {
    flex-direction: column;
  }

  .login-toolbar {
    position: absolute;
    top: 37px;
  }

  .login-brand {
    flex: none;
    height: auto;
    min-height: auto;
    padding: 28px 40px 0;
    background: #fff;

    &__hero {
      display: none;
    }
  }

  .dark .login-brand {
    background: #0b1020;
  }

  .login-card {
    flex: 1;
    justify-content: flex-start;
    padding: 96px 48px 0;
  }
}

@media (max-width: 640px) {
  .login-toolbar {
    top: 33px;
    right: 20px;
  }

  .login-brand {
    padding: 24px 0 0 24px;
  }

  .login-card {
    padding: 72px 24px 0;

    &__inner {
      width: 100%;
      padding: 0;
    }
  }
}
</style>
