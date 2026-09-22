import type { BusinessPageOptions } from "@/components/business/crud/page";

/** 销售组织轻量页面声明；config 与导航目标共用，不导入字段/API。
 * @example
 * `page: salePage`
 */
export const salePage: BusinessPageOptions<"org-a"> = {
  basePath: "/base/sale",
  organizationId: "org-a",
  columns: 2,
  layout: { preset: "simple", entityLabel: "销售组织" },
  guideMode: "spotlight",
  presentation: {
    mode: "drawer",
    detail: { mode: "tab" },
  },
  components: {
    add: () => import("./add.vue"),
    edit: () => import("./edit.vue"),
    detail: () => import("./detail.vue"),
  },
};
