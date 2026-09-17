import type { CustomerRecord, CustomerSavePayload } from "../src/api/base/customer/types";
import { geography } from "./business-reference-data";
import { saleRows } from "./sale-data";

export function validateCustomerPayload(data: CustomerSavePayload): string | undefined {
  if (!data || typeof data !== "object") return "客户资料不能为空";
  if (
    !saleRows.some((row) => row.id === data.saleId && row.organizationId === "org-a" && row.active)
  )
    return "请选择有效的销售组织";
  if (
    typeof data.customerName !== "string" ||
    !data.customerName.trim() ||
    data.customerName.length > 100
  )
    return "请填写 100 字以内的客户名称";
  if (!["distributor", "chain", "hospital"].includes(data.customerType)) return "请选择客户类型";
  for (const key of ["shortName", "creditCode", "phone", "address", "remark"] as const)
    if (typeof data[key] !== "string") return "客户字段格式不正确";
  if (data.creditCode && !/^[A-Z0-9]{18}$/.test(data.creditCode))
    return "统一社会信用代码应为 18 位大写字母或数字";
  if (!data.address.trim()) return "请填写详细地址";
  const province = geography.find(
    (item) => item.id === data.provinceId && item.level === "province"
  );
  const city = geography.find(
    (item) => item.id === data.cityId && item.parentId === province?.id && item.level === "city"
  );
  const district = geography.find(
    (item) => item.id === data.districtId && item.parentId === city?.id && item.level === "district"
  );
  if (!province || !city || !district) return "省、市、区县不匹配，请重新选择";
  if (!Array.isArray(data.contacts) || !Array.isArray(data.addresses)) return "子表格式不正确";
  for (const items of [data.contacts, data.addresses]) {
    if (
      items.some(
        (item) =>
          !item || typeof item.id !== "string" || !item.id || typeof item.primary !== "boolean"
      )
    )
      return "子表行键或默认标记无效";
    if (new Set(items.map((item) => item.id)).size !== items.length) return "子表存在重复行键";
    if (items.length && items.filter((item) => item.primary).length !== 1)
      return "子表请保留且仅保留一个默认项";
  }
  for (const row of data.contacts) {
    if ([row.name, row.phone].some((value) => typeof value !== "string" || !value.trim()))
      return "联系人姓名和电话不能为空";
    if (typeof row.position !== "string" || typeof row.email !== "string")
      return "联系人字段格式不正确";
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return "联系人邮箱格式不正确";
  }
  for (const row of data.addresses)
    if (
      [row.label, row.recipient, row.phone, row.address].some(
        (value) => typeof value !== "string" || !value.trim()
      )
    )
      return "请完整填写收货地址信息";
}

export function materializeCustomer(
  data: CustomerSavePayload,
  id: string,
  customerCode: string,
  previous?: CustomerRecord
): CustomerRecord {
  // Mock 同样只接收写入白名单；不能用客户端传入的 status 覆盖审核状态。
  return {
    saleId: data.saleId,
    saleName: saleRows.find((row) => row.id === data.saleId)?.name ?? "",
    customerName: data.customerName.trim(),
    shortName: data.shortName.trim(),
    customerType: data.customerType,
    creditCode: data.creditCode,
    phone: data.phone,
    provinceId: data.provinceId,
    cityId: data.cityId,
    districtId: data.districtId,
    address: data.address,
    remark: data.remark,
    contacts: structuredClone(data.contacts),
    addresses: structuredClone(data.addresses),
    id,
    customerCode,
    provinceName: geography.find((item) => item.id === data.provinceId)?.name ?? "",
    cityName: geography.find((item) => item.id === data.cityId)?.name ?? "",
    districtName: geography.find((item) => item.id === data.districtId)?.name ?? "",
    status: previous?.status ?? "pending",
    active: previous?.active ?? true,
    createdBy: previous?.createdBy ?? "管理员",
    createdTime: previous?.createdTime ?? new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    version: previous ? previous.version + 1 : 0,
  };
}

export function createCustomerSeeds(): CustomerRecord[] {
  const names = [
    "上海明川医药有限公司",
    "苏州恒信医药商业有限公司",
    "南京仁禾医药有限公司",
    "上海益合大药房连锁有限公司",
    "苏州和悦医院",
    "南京康宁大药房连锁有限公司",
    "上海澄心医疗中心",
    "苏州嘉禾医药有限公司",
    "南京华信医药供应链有限公司",
    "上海安禾医药商业有限公司",
    "苏州惠民大药房连锁有限公司",
    "南京明川医疗器械与健康服务有限公司",
  ];
  const people = ["陈晓", "陆敏", "王宁", "周悦", "许洁", "沈林"];
  const regions = [
    { provinceId: "310000", cityId: "310100", districtId: "310115", address: "张江路 88 号 3 层" },
    { provinceId: "320000", cityId: "320500", districtId: "320505", address: "科创路 126 号 A 座" },
    {
      provinceId: "320000",
      cityId: "320100",
      districtId: "320102",
      address: "玄武大道 66 号 2 层",
    },
  ];
  return names.map((name, index) => {
    const id = `customer-${String(index + 1).padStart(3, "0")}`;
    const person = people[index % people.length];
    const phone = `1380000${String(index + 1).padStart(4, "0")}`;
    const data: CustomerSavePayload = {
      saleId: index % 2 ? "sale-south" : "sale-east",
      customerName: name,
      shortName: name.slice(2, 6),
      customerType: name.includes("药房")
        ? "chain"
        : name.includes("医院") || name.includes("医疗中心")
          ? "hospital"
          : "distributor",
      creditCode: `91310000MA${String(index + 1).padStart(8, "0")}`,
      phone: `021-6800${String(index + 1).padStart(4, "0")}`,
      ...regions[index % regions.length],
      remark:
        index === 0
          ? "华东区域合作客户，日常业务请优先联系采购部；配送前请与仓库确认收货时间。"
          : "",
      contacts: [
        {
          id: `${id}-contact-1`,
          name: person,
          position: "采购部 · 采购经理",
          phone,
          email: `contact${index + 1}@example.com`,
          primary: true,
        },
        ...(index === 0
          ? [
              {
                id: `${id}-contact-2`,
                name: "林悦",
                position: "财务部 · 结算专员",
                phone: "13800000020",
                email: "finance@example.com",
                primary: false,
              },
            ]
          : []),
      ],
      addresses: [
        {
          id: `${id}-address-1`,
          label: "中心仓库",
          recipient: person,
          phone,
          address: `${index % 3 === 0 ? "上海市浦东新区" : index % 3 === 1 ? "江苏省苏州市虎丘区" : "江苏省南京市玄武区"}${regions[index % 3].address}`,
          primary: true,
        },
      ],
    };
    return {
      ...materializeCustomer(data, id, `KH${String(index + 1).padStart(6, "0")}`),
      status: index % 4 === 0 ? "pending" : "approved",
      active: index !== 7,
      createdTime: "2026-09-01T01:30:00.000Z",
      updatedTime: `2026-09-${String(9 - (index % 4)).padStart(2, "0")}T06:20:00.000Z`,
    };
  });
}
