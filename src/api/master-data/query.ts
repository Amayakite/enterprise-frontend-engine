import type { QuerySchema } from "@/components/business/search/types";

const text = {
  kind: "text",
  entries: ["normal", "advanced"],
  operators: ["contains", "eq"],
} as const;
const common = {
  keyword: {
    label: "关键字",
    kind: "text",
    entries: ["quick"],
    operators: ["contains"],
    placeholder: "名称或编码",
  },
  name: { ...text, label: "名称" },
  active: {
    label: "启用状态",
    kind: "boolean",
    entries: ["normal", "advanced"],
    operators: ["eq"],
  },
} as const;
/** 能力白名单与新 /query 端点一起交付；旧 search/resolve 保持原协议。 */
export const masterQuerySchemas = {
  parties: {
    ...common,
    code: { ...text, label: "单位编码" },
    groupName: { ...text, label: "所属集团" },
  },
  inventory: {
    ...common,
    code: { ...text, label: "药品编码" },
    specification: { ...text, label: "规格" },
    factoryName: { ...text, label: "生产厂家" },
  },
  geography: { ...common, id: { ...text, label: "地区编码" } },
  "service-items": {
    ...common,
    code: { ...text, label: "服务编码" },
    category: { ...text, label: "类别" },
  },
  "service-targets": {
    ...common,
    code: { ...text, label: "对象编码" },
    cityName: { ...text, label: "城市" },
  },
  projects: { ...common, code: { ...text, label: "项目编码" } },
  attendees: { ...common, mobile: { ...text, label: "手机号码" } },
} as const satisfies Readonly<Record<string, QuerySchema>>;
export function masterQuerySchema(source: string): QuerySchema | undefined {
  return Object.hasOwn(masterQuerySchemas, source)
    ? masterQuerySchemas[source as keyof typeof masterQuerySchemas]
    : undefined;
}
