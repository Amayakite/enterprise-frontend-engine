<template>
  <section class="layout-content" :style="{ height: appMainHeight }">
    <router-view>
      <template #default="{ Component, route }">
        <transition :name="transitionName" mode="out-in">
          <keep-alive :include="cachedViews">
            <component :is="currentComponent(Component, route)" :key="route.fullPath" />
          </keep-alive>
        </transition>
      </template>
    </router-view>

    <el-backtop target=".layout-content">
      <div class="i-svg:backtop w-6 h-6" />
    </el-backtop>
  </section>
</template>

<script setup lang="ts">
import { useRoute, type RouteLocationNormalized } from "vue-router";
import { useSettingsStore, useTagsViewStore } from "@/stores";
import variables from "@/assets/styles/variables.module.scss";
import Error404 from "@/pages/error/404.vue";

const { cachedViews } = toRefs(useTagsViewStore());
const route = useRoute();

const settingsStore = useSettingsStore();

const wrapperMap = new Map<string, Component>();
/**
 * KeepAlive 的 include 只匹配组件定义的 name，不能传 VNode。用 fullPath 作为
 * 路由实例名可隔离不同详情/编辑地址，并与 tags-view 中的 cachedViews 一一对应。
 */
const currentComponent = (
  component: Component,
  route: RouteLocationNormalized
): Component | undefined => {
  if (!component) return;

  const { fullPath: componentName } = route;
  let wrapper = wrapperMap.get(componentName);

  if (!wrapper) {
    wrapper = {
      name: componentName,
      render: () => {
        try {
          return h(component);
        } catch (error) {
          console.error(`Error rendering component for route: ${componentName}`, error);
          return h(Error404);
        }
      },
    };
    wrapperMap.set(componentName, wrapper);
  }

  return wrapper;
};

/**
 * 包装组件与真实 KeepAlive 白名单同步释放。不能按数量直接淘汰，否则可能删掉仍被
 * KeepAlive 使用的组件定义；未保存表单也不应因为达到一个隐式上限而丢失。
 */
watch(
  [cachedViews, () => route.fullPath],
  ([nextCachedViews, activeFullPath]) => {
    const retained = new Set(nextCachedViews);
    retained.add(activeFullPath);

    for (const componentName of wrapperMap.keys()) {
      if (!retained.has(componentName)) {
        wrapperMap.delete(componentName);
      }
    }
  },
  { flush: "post" }
);

const appMainHeight = computed(() => {
  if (settingsStore.showTagsView) {
    return `calc(100vh - ${variables["navbar-height"]} - ${variables["tags-view-height"]})`;
  } else {
    return `calc(100vh - ${variables["navbar-height"]})`;
  }
});

const transitionName = computed(() => {
  return settingsStore.pageSwitchingAnimation ?? "";
});
</script>

<style lang="scss" scoped>
.layout-content {
  position: relative;
  overflow-y: auto;
  background-color: var(--page-bg);

  /* fade */
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.3s ease-in-out;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }

  /* fade-slide */
  .fade-slide-leave-active,
  .fade-slide-enter-active {
    transition: all 0.3s;
  }
  .fade-slide-enter-from {
    opacity: 0;
    transform: translateX(-30px);
  }
  .fade-slide-leave-to {
    opacity: 0;
    transform: translateX(30px);
  }

  /* fade-scale */
  .fade-scale-leave-active,
  .fade-scale-enter-active {
    transition: all 0.28s;
  }
  .fade-scale-enter-from {
    opacity: 0;
    transform: scale(1.2);
  }
  .fade-scale-leave-to {
    opacity: 0;
    transform: scale(0.8);
  }
}
</style>
