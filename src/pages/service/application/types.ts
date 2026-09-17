import type { ServiceApplicationStatus, ServiceTargetType } from "@/api/service/application/types";
import type { OrganizationScope } from "@/api/master-data/types";

export interface ServiceApplicationPageContext {
  organizationId: OrganizationScope;
}

export interface ServiceApplicationSearchModel {
  keyword: string;
  status: ServiceApplicationStatus | "";
  serviceDateRange: string[] | null;
}

export interface ServiceApplicationFormModel {
  id: string | null;
  applyCode: string;
  version: number;
  serviceDate: string;
  principalPartyId: string | null;
  providerPartyId: string | null;
  provinceId: string | null;
  provinceName: string;
  cityId: string | null;
  cityName: string;
  districtId: string | null;
  districtName: string;
  targetType: ServiceTargetType;
  targetId: string | null;
  inventoryId: string | null;
  factoryName: string;
  serviceItemId: string | null;
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
}
