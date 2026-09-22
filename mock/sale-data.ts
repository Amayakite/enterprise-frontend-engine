import type { SaleRecord, SalePayload } from "../src/api/base/sale/types";
import { defineMockData } from "vite-plugin-mock-dev-server/helper";
/** 开发进程共享数据，客户校验和 Sale 端点使用同一来源；重启恢复。 */
export const saleRows = defineMockData<SaleRecord[]>(
  "business:sale:rows",
  [
    {
      id: "sale-east",
      code: "SALE-HD",
      name: "华东销售组织",
      active: true,
      remark: "负责华东区域客户",
      organizationId: "org-a",
      version: 0,
    },
    {
      id: "sale-south",
      code: "SALE-HN",
      name: "华南销售组织",
      active: true,
      remark: "负责华南区域客户",
      organizationId: "org-a",
      version: 0,
    },
    {
      id: "sale-old",
      code: "SALE-OLD",
      name: "历史销售组织",
      active: false,
      remark: "历史记录可查看，不允许新选择",
      organizationId: "org-a",
      version: 0,
    },
  ],
  { persistOnHMR: true }
).value;
/** Mock 保存同样执行白名单，不接受客户端组织、ID 或版本覆盖。 */
export function salePayload(value: SalePayload): SalePayload {
  if (!value || typeof value.code !== "string" || !value.code.trim() || value.code.length > 30)
    throw new Error("请填写30字以内的组织编码");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80)
    throw new Error("请填写80字以内的组织名称");
  if (
    typeof value.active !== "boolean" ||
    typeof value.remark !== "string" ||
    value.remark.length > 300
  )
    throw new Error("状态或备注格式不正确");
  return {
    code: value.code.trim(),
    name: value.name.trim(),
    active: value.active,
    remark: value.remark.trim(),
  };
}
