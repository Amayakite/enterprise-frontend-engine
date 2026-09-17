import type { BaseQueryParams } from "@/types/http";

export type ServiceApplicationStatus = "draft" | "approved";
export type ServiceTargetType = "outlet" | "customer";

export interface ServiceApplicationQueryParams extends BaseQueryParams {
  keyword?: string;
  status?: ServiceApplicationStatus | "";
  serviceDateStart?: string;
  serviceDateEnd?: string;
  sortKey?: keyof Pick<ServiceApplicationItem, "applyCode" | "serviceDate" | "amount">;
  sortOrder?: "asc" | "desc";
}

export interface ServiceApplicationItem {
  id: string;
  applyCode: string;
  serviceDate: string;
  principalPartyId: string;
  principalPartyName: string;
  providerPartyId: string;
  providerPartyName: string;
  provinceId: string | null;
  provinceName: string;
  cityId: string | null;
  cityName: string;
  districtId: string | null;
  districtName: string;
  targetType: ServiceTargetType;
  targetId: string | null;
  targetName: string;
  inventoryId: string;
  inventoryName: string;
  factoryName: string;
  serviceItemId: string;
  serviceItemName: string;
  serviceCategory: string;
  serviceUnit: string;
  calculateBasis: "fixed" | "person" | "quantity";
  price: string;
  personCount: number | null;
  quantity: number | null;
  amount: string;
  remark: string;
  status: ServiceApplicationStatus;
  createdBy: string;
  createdTime: string;
  version: number;
}

export interface ServiceApplicationSavePayload {
  serviceDate: string;
  principalPartyId: string;
  providerPartyId: string;
  provinceId: string | null;
  provinceName: string;
  cityId: string | null;
  cityName: string;
  districtId: string | null;
  districtName: string;
  targetType: ServiceTargetType;
  targetId: string | null;
  inventoryId: string;
  serviceItemId: string;
  personCount: number | null;
  quantity: number | null;
  amount: string;
  remark: string;
}

export interface ServiceApplicationSaveResult {
  id: string;
  applyCode: string;
  version: number;
}

export interface ServiceApplicationActionResult {
  affectedIds: string[];
}
