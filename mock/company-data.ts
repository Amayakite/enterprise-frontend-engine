import type { CompanyRecord, CompanyPayload } from "../src/api/base/company/types";
import { defineMockData } from "vite-plugin-mock-dev-server/helper";
import { cloneModel } from "../src/components/business/fields/model";
/** 演示记录不代表真实公司；仅开发进程内保留，重启后恢复。 */
export const companyRows = defineMockData<CompanyRecord[]>(
  "business:company:rows",
  [
    {
      id: "company-demo",
      code: "COMP-001",
      name: "示例医药有限公司",
      contactName: "张经理",
      phone: "",
      active: true,
      remark: "演示档案，请维护实际公司位置",
      location: null,
      contractTemplate: null,
      organizationId: "org-a",
      version: 0,
    },
    {
      id: "company-distribution",
      code: "COMP-002",
      name: "示例医药配送有限公司",
      contactName: "",
      phone: "",
      active: true,
      remark: "可维护配送中心的位置与业务区域",
      location: null,
      contractTemplate: null,
      organizationId: "org-a",
      version: 0,
    },
  ],
  { persistOnHMR: true }
).value;
/** Mock 写入只接收可编辑字段；真实坐标/范围校验与组织鉴权仍需后端实现。 */
export function companyPayload(value: CompanyPayload): CompanyPayload {
  if (!value || typeof value.code !== "string" || !value.code.trim() || value.code.length > 30)
    throw new Error("请填写30字以内的公司编码");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80)
    throw new Error("请填写80字以内的公司名称");
  if (
    typeof value.active !== "boolean" ||
    typeof value.remark !== "string" ||
    value.remark.length > 300
  )
    throw new Error("状态或备注格式不正确");
  if (
    typeof value.contactName !== "string" ||
    value.contactName.length > 40 ||
    typeof value.phone !== "string" ||
    value.phone.length > 40
  )
    throw new Error("联系人或电话格式不正确");
  if (value.location !== null) {
    const location = value.location;
    if (
      !location ||
      !["amap", "tencent"].includes(location.provider) ||
      location.coordinateSystem !== "GCJ-02" ||
      !location.place ||
      typeof location.place.name !== "string" ||
      !location.place.name.trim() ||
      location.place.name.length > 120 ||
      typeof location.place.address !== "string" ||
      location.place.address.length > 300 ||
      !location.place.point ||
      !Number.isFinite(location.place.point.lng) ||
      Math.abs(location.place.point.lng) > 180 ||
      !Number.isFinite(location.place.point.lat) ||
      Math.abs(location.place.point.lat) > 90
    )
      throw new Error("公司位置格式不正确");
    if (
      location.region &&
      (location.region.provider !== location.provider ||
        location.region.coordinateSystem !== "GCJ-02")
    )
      throw new Error("区域与位置来源不一致");
  }
  const template = value.contractTemplate ?? null;
  if (
    template &&
    (typeof template.name !== "string" ||
      !/\.docx$/i.test(template.name) ||
      typeof template.url !== "string" ||
      !template.url)
  )
    throw new Error("合同模板引用格式不正确");
  return {
    contractTemplate: template ? { name: template.name, url: template.url } : null,
    code: value.code.trim(),
    name: value.name.trim(),
    active: value.active,
    remark: value.remark.trim(),
    contactName: value.contactName.trim(),
    phone: value.phone.trim(),
    location: cloneModel(value.location),
  };
}
