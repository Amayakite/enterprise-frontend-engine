import type { ReferenceProps, ReferenceSource } from "@/components/business/MyReference/types";
import type { Customer, OrganizationFilters } from "@/api/reference-lab/types";
import { customerSource } from "./references";

// 此文件只参与类型检查，不导入运行时页面。错误写法若意外被接受，vue-tsc 会报未使用指令。
const base = {
  source: customerSource,
  filters: { organizationId: "org-a" as const },
  scopeKey: "lab:user-a:org-a:1",
};
export const single: ReferenceProps<Customer, number, OrganizationFilters> = {
  ...base,
  modelValue: 0,
};
export const multiple: ReferenceProps<Customer, number, OrganizationFilters> = {
  ...base,
  multiple: true,
  modelValue: [0, 2],
};
// @ts-expect-error 单选不能绑定数组
export const singleArray: ReferenceProps<Customer, number, OrganizationFilters> = {
  ...base,
  modelValue: [0],
};
// @ts-expect-error 多选不能绑定标量
export const multipleScalar: ReferenceProps<Customer, number, OrganizationFilters> = {
  ...base,
  multiple: true,
  modelValue: 0,
};
export const wrongId: ReferenceProps<Customer, number, OrganizationFilters> = {
  ...base,
  // @ts-expect-error source 为 number，模型不能是 string
  modelValue: "0",
};
export const wrongSourceKey: ReferenceSource<Customer, number, OrganizationFilters> = {
  ...customerSource,
  // @ts-expect-error getKey 必须返回 number
  getKey: (row) => String(row.id),
};
export const wrongSourceResponse: ReferenceSource<Customer, number, OrganizationFilters> = {
  ...customerSource,
  // @ts-expect-error search 必须返回 list/total，不能返回后端响应壳
  search: async () => ({ code: "00000", data: { list: [], total: 0 }, msg: "" }),
};
export const wrongResolve: ReferenceSource<Customer, number, OrganizationFilters> = {
  ...customerSource,
  // @ts-expect-error unavailableIds 必须使用同一个 number ID 类型
  resolve: async () => ({ items: [], unavailableIds: ["0"] }),
};
