import type { ReferenceFilters } from "@/components/business/MyReference/types";

export type OrganizationScope = "org-a";

export interface PartyItem {
  id: string;
  code: string;
  name: string;
  role: "principal" | "provider" | "both";
  groupName: string;
  organizationName: string;
  active: boolean;
}

export type PartyFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  role: "principal" | "provider";
};

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  specification: string;
  unit: string;
  businessName: string;
  factoryCode: string;
  factoryName: string;
  active: boolean;
}

export type InventoryFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  ownerPartyId: string | null;
};

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  calculateBasis: "fixed" | "person" | "quantity";
  price: string;
  targetType: "outlet" | "customer";
  active: boolean;
}

export type ServiceItemFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  projectId: string | null;
};

export interface GeographyItem {
  id: string;
  name: string;
  level: "province" | "city" | "district";
  parentId: string | null;
  active: boolean;
}

export type GeographyFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  level: GeographyItem["level"];
  parentId: string | null;
};

export interface ServiceTargetItem {
  id: string;
  code: string;
  name: string;
  type: "outlet" | "customer";
  provinceId: string;
  provinceName: string;
  cityId: string;
  cityName: string;
  districtId: string;
  districtName: string;
  levelName: string;
  active: boolean;
}

export type ServiceTargetFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  targetType: ServiceTargetItem["type"];
  providerPartyId: string | null;
};

export interface ProjectItem {
  id: string;
  code: string;
  name: string;
  principalPartyId: string;
  inventoryId: string;
  serviceItemId: string;
  active: boolean;
}

export type ProjectFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  principalPartyId: string | null;
};

export interface AttendeeCandidate {
  id: string;
  code: string;
  name: string;
  mobile: string;
  targetId: string;
  targetName: string;
  active: boolean;
}

export type AttendeeFilters = ReferenceFilters & {
  organizationId: OrganizationScope;
  targetId: string | null;
  serviceItemId: string | null;
};

