import type { FileInfo } from "@/api/file/types";
import type { BaseQueryParams } from "@/types/http";
import type { QueryPageRequest } from "@/components/business/search/types";
import type { feeQuerySchema, feeSortKeys } from "./query";

export interface FeeQueryScope {
  organizationId: string;
}
export interface FeeSearchRequest extends Omit<
  QueryPageRequest<typeof feeQuerySchema, FeeQueryScope>,
  "sort"
> {
  sort: { key: (typeof feeSortKeys)[number]; order: "asc" | "desc" } | null;
}

export type FeeStatus = "draft" | "approved";

export interface FeeQueryParams extends BaseQueryParams {
  keyword?: string;
  status?: FeeStatus | "";
  billDateStart?: string;
  billDateEnd?: string;
  sortKey?: keyof Pick<FeeItem, "billCode" | "billDate" | "amount" | "createdTime">;
  sortOrder?: "asc" | "desc";
}

export interface FeeItem {
  id: string;
  billCode: string;
  billDate: string;
  principalPartyId: string;
  principalPartyName: string;
  providerPartyId: string;
  providerPartyName: string;
  inventoryId: string;
  inventoryName: string;
  businessName: string;
  factoryName: string;
  amount: string;
  attachments: FileInfo[];
  remark: string;
  status: FeeStatus;
  generatedTaskCodes: string[];
  failureReason: string;
  createdBy: string;
  createdTime: string;
  version: number;
}

export interface FeeSavePayload {
  billDate: string;
  principalPartyId: string;
  providerPartyId: string;
  inventoryId: string;
  amount: string;
  attachments: FileInfo[];
  remark: string;
}

export interface FeeSaveResult {
  id: string;
  billCode: string;
  version: number;
}

export interface FeeActionPayload {
  ids: string[];
  reason?: string;
}

export interface FeeActionResult {
  affectedIds: string[];
}
