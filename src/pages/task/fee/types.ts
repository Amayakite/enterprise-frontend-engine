import type { FileInfo } from "@/api/file/types";
import type { FeeStatus } from "@/api/task/fee/types";
import type { OrganizationScope } from "@/api/master-data/types";

export interface FeePageContext {
  organizationId: OrganizationScope;
  scopeKey: string;
}

export interface FeeFormModel {
  id: string | null;
  billCode: string;
  version: number;
  billDate: string;
  principalPartyId: string | null;
  providerPartyId: string | null;
  inventoryId: string | null;
  businessName: string;
  factoryName: string;
  amount: string;
  attachments: FileInfo[];
  remark: string;
  status: FeeStatus;
  generatedTaskText: string;
  createdBy: string;
  createdTime: string;
}
