import { createReferenceField } from "@/components/business/fields/reference";
import { createGeographyReference } from "@/api/master-data/reference";
import type { CustomerFormModel, CustomerPageContext } from "./types";

/** config 与编辑页共同使用的省份源；创建时不发请求。 */
export const customerProvinceSource = createGeographyReference("省份");
/** 共享参照定义，页面通过 withMap 创建自己的回写策略，不修改此对象。 */
export const customerReferences = {
  /** 省份默认回填；城市/区县清理仍由主 config.links 处理。 */
  province: createReferenceField<CustomerFormModel, CustomerPageContext>()({
    source: customerProvinceSource,
    map: ({ items }) => ({ provinceName: items[0]?.name ?? "" }),
    filters: ({ context }) => ({
      organizationId: context.organizationId,
      level: "province" as const,
      parentId: null,
    }),
    scopeKey: ({ context }) => context.scopeKey,
  }),
};
