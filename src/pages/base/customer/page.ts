import type { BusinessPageOptions } from "@/components/business/crud/page";

/** 客户轻量页面声明；config 与导航目标共用，不导入字段/API。
 * @example
 * `page: customerPage`
 */
export const customerPage: BusinessPageOptions<"org-a"> = {
  basePath: "/base/customer",
  organizationId: "org-a",
  columns: 3,
  layout: { preset: "structured", entityLabel: "客户" },
  guideMode: "spotlight",
  presentation: {
    mode: "tab",
  },
  components: {
    add: () => import("./add.vue"),
    edit: () => import("./edit.vue"),
    detail: () => import("./detail.vue"),
  },
};
