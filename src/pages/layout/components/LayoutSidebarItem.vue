<template>
  <div v-if="!item.meta || !item.meta.hidden">
    <template
      v-if="
        (hasOneShowingChild(item.children, item) &&
          !item.meta?.alwaysShow &&
          (!onlyOneChild.children || onlyOneChild.noShowingChildren)) ||
        (item.meta?.alwaysShow && !item.children)
      "
    >
      <AppLink
        v-if="onlyOneChild.meta"
        :to="{
          path: resolvePath(onlyOneChild.path),
          meta: onlyOneChild.meta,
          query: onlyOneChild.meta.params,
        }"
      >
        <el-menu-item
          :index="resolvePath(onlyOneChild.path)"
          :class="{ 'submenu-title-noDropdown': !isNest }"
        >
          <template v-if="onlyOneChild.meta">
            <LayoutMenuIcon :icon="onlyOneChild.meta.icon || item.meta?.icon" />
            <span v-if="onlyOneChild.meta.title" class="ml-1" :title="onlyOneChild.meta.title">
              {{ onlyOneChild.meta.title }}
            </span>
          </template>
        </el-menu-item>
      </AppLink>
    </template>

    <el-sub-menu
      v-else
      :class="{ 'has-active-child': hasActiveChild }"
      :index="resolvePath(item.path)"
      :data-path="item.path"
      teleported
    >
      <template #title>
        <template v-if="item.meta">
          <LayoutMenuIcon :icon="item.meta.icon" />
          <span v-if="item.meta.title" class="ml-1" :title="item.meta.title">
            {{ item.meta.title }}
          </span>
        </template>
      </template>

      <LayoutSidebarItem
        v-for="child in item.children"
        :key="child.path"
        :is-nest="true"
        :item="child"
        :active-path="activePath"
        :base-path="resolvePath(child.path)"
      />
    </el-sub-menu>
  </div>
</template>

<script setup lang="ts">
import path from "path-browserify";
import type { RouteRecordRaw } from "vue-router";
import { isExternal } from "@/utils";
import LayoutMenuIcon from "./LayoutMenuIcon.vue";

type SidebarRoute = RouteRecordRaw & {
  noShowingChildren?: boolean;
};

defineOptions({
  name: "LayoutSidebarItem",
  inheritAttrs: false,
});

const props = defineProps({
  /** 当前路由对象 */
  item: {
    type: Object as PropType<RouteRecordRaw>,
    required: true,
  },

  /** 父级完整路径 */
  basePath: {
    type: String,
    required: true,
  },

  /** 当前激活的业务菜单路径；详情页面传入 meta.activeMenu，递归用于父菜单高亮。 */
  activePath: { type: String, required: true },

  /** 是否为嵌套路由 */
  isNest: {
    type: Boolean,
    default: false,
  },
});

// 激活态由路由数据推导，不读取 Element Plus 的内部节点。
const hasActiveChild = computed(() => {
  function contains(item: RouteRecordRaw, fullPath: string): boolean {
    if (item.meta?.hidden || isExternal(fullPath)) return false;
    return (
      fullPath === props.activePath ||
      (item.children ?? []).some((child) => contains(child, path.resolve(fullPath, child.path)))
    );
  }
  return contains(props.item, props.basePath);
});

const onlyOneChild = ref<SidebarRoute>({} as SidebarRoute);

/**
 * 判断当前路由是否应按叶子菜单渲染
 */
function hasOneShowingChild(children: RouteRecordRaw[] = [], parent: RouteRecordRaw) {
  const showingChildren = children.filter((route: RouteRecordRaw) => {
    if (!route.meta?.hidden) {
      onlyOneChild.value = route as SidebarRoute;
      return true;
    }
    return false;
  });

  if (showingChildren.length === 1) {
    return true;
  }

  if (showingChildren.length === 0) {
    onlyOneChild.value = { ...parent, path: "", noShowingChildren: true } as SidebarRoute;
    return true;
  }
  return false;
}

/**
 * 解析菜单跳转路径
 */
function resolvePath(routePath: string) {
  if (isExternal(routePath)) return routePath;
  if (isExternal(props.basePath)) return props.basePath;

  return path.resolve(props.basePath, routePath);
}
</script>
