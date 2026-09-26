import type { BusinessPageOptions } from "@/components/business/crud/page";

/** 公司轻量页面声明；config 与导航目标共用，不导入字段/API。
 * @example
 * `page: companyPage`
 */
export const companyPage: BusinessPageOptions<"org-a"> = {
  basePath: "/base/company",
  organizationId: "org-a",
  columns: 2,
  layout: { preset: "simple", entityLabel: "公司" },
  guideMode: "spotlight",
  presentation: {
    mode: "tab",
    detail: { mode: "tab" },
  },
  components: {
    add: () => import("./add.vue"),
    edit: () => import("./edit.vue"),
    detail: () => import("./detail.vue"),
  },
};
