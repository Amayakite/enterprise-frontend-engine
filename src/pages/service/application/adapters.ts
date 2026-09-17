import type {
  ServiceApplicationItem,
  ServiceApplicationQueryParams,
  ServiceApplicationSavePayload,
} from "@/api/service/application/types";
import { formatDate } from "@/utils/date";
import { toFixedDecimal } from "@/utils/decimal";
import type { ServiceApplicationFormModel, ServiceApplicationSearchModel } from "./types";

export function createInitialServiceApplicationSearch(): ServiceApplicationSearchModel {
  return { keyword: "", status: "", serviceDateRange: null };
}

export function createInitialServiceApplicationForm(): ServiceApplicationFormModel {
  return {
    id: null,
    applyCode: "",
    version: 0,
    serviceDate: formatDate(new Date()),
    principalPartyId: null,
    providerPartyId: null,
    provinceId: null,
    provinceName: "",
    cityId: null,
    cityName: "",
    districtId: null,
    districtName: "",
    targetType: "outlet",
    targetId: null,
    inventoryId: null,
    factoryName: "",
    serviceItemId: null,
    serviceCategory: "",
    serviceUnit: "",
    calculateBasis: "fixed",
    price: "0.00",
    personCount: null,
    quantity: 1,
    amount: "0.00",
    remark: "",
    status: "draft",
    createdBy: "",
    createdTime: "",
  };
}

export function toServiceApplicationQuery(
  model: ServiceApplicationSearchModel,
  pageNum: number,
  pageSize: number
): ServiceApplicationQueryParams {
  return {
    pageNum,
    pageSize,
    keyword: model.keyword.trim(),
    status: model.status,
    serviceDateStart: model.serviceDateRange?.[0] ?? "",
    serviceDateEnd: model.serviceDateRange?.[1] ?? "",
  };
}

export function toServiceApplicationForm(
  item: ServiceApplicationItem
): ServiceApplicationFormModel {
  return {
    id: item.id,
    applyCode: item.applyCode,
    version: item.version,
    serviceDate: item.serviceDate,
    principalPartyId: item.principalPartyId,
    providerPartyId: item.providerPartyId,
    provinceId: item.provinceId,
    provinceName: item.provinceName,
    cityId: item.cityId,
    cityName: item.cityName,
    districtId: item.districtId,
    districtName: item.districtName,
    targetType: item.targetType,
    targetId: item.targetId,
    inventoryId: item.inventoryId,
    factoryName: item.factoryName,
    serviceItemId: item.serviceItemId,
    serviceCategory: item.serviceCategory,
    serviceUnit: item.serviceUnit,
    calculateBasis: item.calculateBasis,
    price: item.price,
    personCount: item.personCount,
    quantity: item.quantity,
    amount: item.amount,
    remark: item.remark,
    status: item.status,
    createdBy: item.createdBy,
    createdTime: item.createdTime,
  };
}

export function toServiceApplicationPayload(
  model: ServiceApplicationFormModel
): ServiceApplicationSavePayload {
  if (
    !model.principalPartyId ||
    !model.providerPartyId ||
    !model.inventoryId ||
    !model.serviceItemId ||
    !model.provinceId ||
    !model.cityId ||
    !model.districtId
  )
    throw new Error("服务申请参照字段不完整");
  return {
    serviceDate: model.serviceDate,
    principalPartyId: model.principalPartyId,
    providerPartyId: model.providerPartyId,
    provinceId: model.provinceId,
    provinceName: model.provinceName,
    cityId: model.cityId,
    cityName: model.cityName,
    districtId: model.districtId,
    districtName: model.districtName,
    targetType: model.targetType,
    targetId: model.targetId,
    inventoryId: model.inventoryId,
    serviceItemId: model.serviceItemId,
    personCount: model.personCount,
    quantity: model.quantity,
    amount: toFixedDecimal(model.amount),
    remark: model.remark.trim(),
  };
}
