import type { App } from "vue";
import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

export const Layout = () => import("@/pages/layout/index.vue");

// 静态路由
export const constantRoutes: RouteRecordRaw[] = [
  // 实验页只在开发构建注册；仍走正常登录守卫，不加入业务菜单。
  ...(import.meta.env.DEV
    ? [
        {
          path: "/component-lab",
          component: Layout,
          meta: { hidden: true },
          children: [
            {
              path: "custom-crud/add",
              name: "CustomCrudAdd",
              component: () => import("@/pages/component-lab/custom-crud/add.vue"),
              meta: { title: "定制新增示例", hidden: true, keepAlive: true },
            },
            {
              path: "custom-crud/edit/:id",
              name: "CustomCrudEdit",
              component: () => import("@/pages/component-lab/custom-crud/edit.vue"),
              meta: { title: "定制编辑示例", hidden: true, keepAlive: true },
            },
            {
              path: "custom-crud/detail/:id",
              name: "CustomCrudDetail",
              component: () => import("@/pages/component-lab/custom-crud/detail.vue"),
              meta: { title: "定制详情示例", hidden: true, keepAlive: true },
            },
            {
              path: "crud",
              name: "CrudLab",
              component: () => import("@/pages/component-lab/crud/index.vue"),
              meta: { title: "CRUD 装配实验", hidden: true, keepAlive: true },
            },
            {
              path: "interaction",
              name: "InteractionLab",
              component: () => import("@/pages/component-lab/interaction/index.vue"),
              meta: { title: "交互与查询实验", hidden: true },
            },
            {
              path: "table",
              name: "TableLab",
              component: () => import("@/pages/component-lab/table/index.vue"),
              meta: { title: "整单明细实验", hidden: true },
            },
            {
              path: "form",
              name: "FormLab",
              component: () => import("@/pages/component-lab/form/index.vue"),
              meta: { title: "字段表单实验", hidden: true },
            },
            {
              path: "reference",
              name: "ReferenceLab",
              component: () => import("@/pages/component-lab/reference/index.vue"),
              meta: { title: "业务组件实验", hidden: true, keepAlive: true },
            },
          ],
        },
      ]
    : []),
  {
    path: "/redirect",
    component: Layout,
    meta: { hidden: true },
    children: [
      {
        path: "/redirect/:path(.*)",
        component: () => import("@/pages/redirect.vue"),
      },
    ],
  },

  {
    path: "/login",
    component: () => import("@/pages/login/index.vue"),
    meta: { hidden: true },
  },

  {
    path: "/",
    name: "/",
    component: Layout,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        component: () => import("@/pages/dashboard/index.vue"),
        // 用于 keep-alive 功能，需要与 SFC 中自动推导或显式声明的组件名称一致
        // 参考文档: https://cn.vuejs.org/guide/built-ins/keep-alive.html#include-exclude
        name: "Dashboard",
        meta: {
          title: "工作台",
          icon: "homepage",
          affix: true,
          keepAlive: true,
        },
      },
      {
        path: "401",
        component: () => import("@/pages/error/401.vue"),
        meta: { hidden: true },
      },
      {
        path: "404",
        component: () => import("@/pages/error/404.vue"),
        meta: { hidden: true },
      },
      {
        path: "profile",
        name: "Profile",
        component: () => import("@/pages/profile/index.vue"),
        meta: { title: "个人中心", icon: "user", hidden: true },
      },
      {
        path: "profile/notice",
        name: "MyNotice",
        component: () => import("@/pages/profile/notice/index.vue"),
        meta: { title: "我的通知", icon: "user", hidden: true },
      },
    ],
  },
];

/**
 * 创建路由
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: constantRoutes,
  // 刷新时，滚动条位置还原
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

// 全局注册 router
export function setupRouter(app: App<Element>) {
  app.use(router);
}

export default router;
