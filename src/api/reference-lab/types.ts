/** 仅开发实验使用的 DTO，真实后端地址/鉴权/字段映射均待联调。 */
export type OrganizationId = "org-a" | "org-b";
export type OrganizationFilters = { organizationId: OrganizationId };
export type ContactFilters = OrganizationFilters & { customerId: number | null };

export interface Customer {
  id: number;
  code: string;
  name: string;
  organizationId: OrganizationId;
  active: boolean;
  region: string;
}

export interface Contact {
  id: string;
  code: string;
  name: string;
  organizationId: OrganizationId;
  active: boolean;
  customerId: number;
  phone: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  organizationId: OrganizationId;
  active: boolean;
  price: number;
  listedDate: string;
}

export interface LabControls {
  delayMs: 50 | 300 | 1500;
  fail?: boolean;
  empty?: boolean;
  duplicate?: boolean;
  partialUnavailable?: boolean;
  failResolve?: boolean;
}
