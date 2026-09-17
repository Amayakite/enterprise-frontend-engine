import type {
  ServiceApplicationItem,
  ServiceApplicationSavePayload,
} from "../src/api/service/application/types";
import { defineMock } from "./base";
import {
  geography,
  inventory,
  inventoryIdsByOwnerParty,
  parties,
  serviceItems,
  serviceTargetIdsByProviderParty,
  serviceTargets,
} from "./business-reference-data";
import { bodyIds, failure, pageResult, success } from "./pilot-document-utils";

let sequence = 5;
let rows: ServiceApplicationItem[] = [
  createSeed(
    "service-app-1",
    "FW202609001",
    "2026-09-03",
    "party-a-1",
    "party-b-1",
    "310000",
    "310100",
    "310115",
    "target-o-1",
    "inv-1",
    "service-1",
    20,
    1,
    "3600.00",
    "draft",
    "浦东终端拜访"
  ),
  createSeed(
    "service-app-2",
    "FW202609002",
    "2026-09-05",
    "party-a-2",
    "party-b-2",
    "320000",
    "320500",
    "320505",
    "target-c-1",
    "inv-2",
    "service-2",
    null,
    1,
    "3500.00",
    "approved",
    "苏州商业客户培训"
  ),
  createSeed(
    "service-app-3",
    "FW202609003",
    "2026-09-07",
    "party-a-1",
    "party-b-2",
    "320000",
    "320100",
    "320102",
    "target-o-2",
    "inv-3",
    "service-3",
    null,
    8,
    "2080.00",
    "draft",
    "南京终端陈列维护"
  ),
  createSeed(
    "service-app-4",
    "FW202609004",
    "2026-09-09",
    "party-a-2",
    "party-b-1",
    "310000",
    "310100",
    "310115",
    "target-c-2",
    "inv-4",
    "service-2",
    null,
    1,
    "3500.00",
    "approved",
    "上海商业培训"
  ),
];

function createSeed(
  id: string,
  applyCode: string,
  serviceDate: string,
  principalPartyId: string,
  providerPartyId: string,
  provinceId: string,
  cityId: string,
  districtId: string,
  targetId: string,
  inventoryId: string,
  serviceItemId: string,
  personCount: number | null,
  quantity: number | null,
  amount: string,
  status: ServiceApplicationItem["status"],
  remark: string
): ServiceApplicationItem {
  const target = serviceTargets.find((row) => row.id === targetId)!;
  return materialize(
    id,
    applyCode,
    {
      serviceDate,
      principalPartyId,
      providerPartyId,
      provinceId,
      provinceName: geography.find((row) => row.id === provinceId)?.name ?? "",
      cityId,
      cityName: geography.find((row) => row.id === cityId)?.name ?? "",
      districtId,
      districtName: geography.find((row) => row.id === districtId)?.name ?? "",
      targetType: target.type,
      targetId,
      inventoryId,
      serviceItemId,
      personCount,
      quantity,
      amount,
      remark,
    },
    { status, createdTime: `${serviceDate} 11:00:00`, version: 0 }
  );
}

function validate(payload: ServiceApplicationSavePayload) {
  const principal = parties.find(
    (row) => row.id === payload.principalPartyId && row.active && row.role !== "provider"
  );
  const provider = parties.find(
    (row) => row.id === payload.providerPartyId && row.active && row.role !== "principal"
  );
  const product = inventory.find(
    (row) =>
      row.id === payload.inventoryId &&
      row.active &&
      inventoryIdsByOwnerParty[payload.principalPartyId]?.includes(row.id)
  );
  const service = serviceItems.find((row) => row.id === payload.serviceItemId && row.active);
  const province = geography.find(
    (row) => row.id === payload.provinceId && row.level === "province" && row.active
  );
  const city = geography.find(
    (row) =>
      row.id === payload.cityId &&
      row.parentId === payload.provinceId &&
      row.level === "city" &&
      row.active
  );
  const district = geography.find(
    (row) =>
      row.id === payload.districtId &&
      row.parentId === payload.cityId &&
      row.level === "district" &&
      row.active
  );
  const target = serviceTargets.find(
    (row) =>
      row.id === payload.targetId &&
      row.type === payload.targetType &&
      row.active &&
      serviceTargetIdsByProviderParty[payload.providerPartyId]?.includes(row.id)
  );
  if (!payload.serviceDate || !principal || !provider || !product || !service)
    return "服务申请的基础资料无效";
  if (!province || !city || !district) return "省市区级联关系无效";
  if (
    payload.provinceName !== province.name ||
    payload.cityName !== city.name ||
    payload.districtName !== district.name
  )
    return "省市区名称与编码不一致";
  if (service.targetType !== payload.targetType) return "服务项目与服务对象类型不匹配";
  if (!target) return "服务对象与服务方或对象类型不匹配";
  if (!/^\d+(\.\d{1,2})?$/.test(payload.amount) || Number(payload.amount) <= 0)
    return "申请金额必须大于 0 且最多保留两位小数";
  if (service.calculateBasis === "person" && (!payload.personCount || payload.personCount <= 0))
    return "按人数计价的服务必须填写人数";
  if (service.calculateBasis === "quantity" && (!payload.quantity || payload.quantity <= 0))
    return "按数量计价的服务必须填写数量";
  if (payload.remark.includes("保存失败")) return "已按约定模拟保存失败，页面输入应继续保留";
  return "";
}

function materialize(
  id: string,
  applyCode: string,
  payload: ServiceApplicationSavePayload,
  previous?: Pick<ServiceApplicationItem, "status" | "createdTime" | "version">
): ServiceApplicationItem {
  const principal = parties.find((row) => row.id === payload.principalPartyId)!;
  const provider = parties.find((row) => row.id === payload.providerPartyId)!;
  const product = inventory.find((row) => row.id === payload.inventoryId)!;
  const service = serviceItems.find((row) => row.id === payload.serviceItemId)!;
  const province = geography.find((row) => row.id === payload.provinceId);
  const city = geography.find((row) => row.id === payload.cityId);
  const district = geography.find((row) => row.id === payload.districtId);
  const target = serviceTargets.find((row) => row.id === payload.targetId);
  return {
    id,
    applyCode,
    ...payload,
    principalPartyName: principal.name,
    providerPartyName: provider.name,
    provinceName: province?.name ?? "",
    cityName: city?.name ?? "",
    districtName: district?.name ?? "",
    targetName: target?.name ?? "",
    inventoryName: product.name,
    factoryName: product.factoryName,
    serviceItemName: service.name,
    serviceCategory: service.category,
    serviceUnit: service.unit,
    calculateBasis: service.calculateBasis,
    price: service.price,
    status: previous?.status ?? "draft",
    createdBy: "系统管理员",
    createdTime: previous?.createdTime ?? `${payload.serviceDate} 11:30:00`,
    version: (previous?.version ?? 0) + 1,
  };
}

function transition(
  ids: string[],
  from: ServiceApplicationItem["status"],
  to: ServiceApplicationItem["status"]
) {
  if (!ids.length) return failure("请选择需要操作的服务申请");
  const selected = rows.filter((row) => ids.includes(row.id));
  if (selected.length !== ids.length || selected.some((row) => row.status !== from))
    return failure(from === "draft" ? "只有未审核申请可以审核" : "只有已审核申请可以弃审");
  rows = rows.map((row) =>
    ids.includes(row.id) ? { ...row, status: to, version: row.version + 1 } : row
  );
  return success({ affectedIds: ids });
}

export default defineMock([
  {
    url: "pilot/service-applications",
    method: ["GET"],
    body: ({ query }: { query: Record<string, unknown> }) =>
      success(
        pageResult(
          rows,
          query,
          (row) =>
            `${row.applyCode} ${row.principalPartyName} ${row.providerPartyName} ${row.targetName} ${row.inventoryName} ${row.serviceItemName}`,
          "serviceDate"
        )
      ),
  },
  {
    url: "pilot/service-applications",
    method: ["POST"],
    body({ body }: { body: ServiceApplicationSavePayload }) {
      const error = validate(body);
      if (error) return failure(error);
      const id = `service-app-${sequence}`;
      const applyCode = `FW202609${String(sequence).padStart(3, "0")}`;
      sequence++;
      const item = materialize(id, applyCode, body);
      rows = [item, ...rows];
      return success({ id, applyCode, version: item.version }, "服务申请已保存到内存 Mock");
    },
  },
  {
    url: "pilot/service-applications/remove",
    method: ["POST"],
    body({ body }: { body?: Record<string, unknown> }) {
      const ids = bodyIds(body);
      const selected = rows.filter((row) => ids.includes(row.id));
      if (!ids.length || selected.length !== ids.length) return failure("待删除服务申请不存在");
      if (selected.some((row) => row.status !== "draft")) return failure("已审核申请不能删除");
      rows = rows.filter((row) => !ids.includes(row.id));
      return success({ affectedIds: ids });
    },
  },
  {
    url: "pilot/service-applications/approve",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(bodyIds(body), "draft", "approved"),
  },
  {
    url: "pilot/service-applications/revoke",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(bodyIds(body), "approved", "draft"),
  },
  {
    url: "pilot/service-applications/:id",
    method: ["GET"],
    body({ params }: { params: { id: string } }) {
      const item = rows.find((row) => row.id === params.id);
      return item ? success(item) : failure("服务申请不存在", "PILOT_NOT_FOUND");
    },
  },
  {
    url: "pilot/service-applications/:id",
    method: ["PUT"],
    body({
      params,
      body,
    }: {
      params: { id: string };
      body: ServiceApplicationSavePayload & { version: number };
    }) {
      const index = rows.findIndex((row) => row.id === params.id);
      const current = rows[index];
      if (!current) return failure("服务申请不存在", "PILOT_NOT_FOUND");
      if (current.status !== "draft") return failure("已审核申请不能编辑");
      if (current.version !== body.version) return failure("申请已被更新，请重新打开");
      const error = validate(body);
      if (error) return failure(error);
      const next = materialize(current.id, current.applyCode, body, current);
      rows[index] = next;
      return success({ id: next.id, applyCode: next.applyCode, version: next.version });
    },
  },
]);
