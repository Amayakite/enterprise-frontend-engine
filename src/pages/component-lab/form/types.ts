import type { FileInfo } from "@/api/file/types";
import type { OrganizationId } from "@/api/reference-lab/types";

export interface FormLabModel {
  customerId: number | null;
  customerName: string;
  contactId: string | null;
  contactName: string;
  contactPhone: string;
  title: string;
  amount: number | null;
  enabled: boolean;
  date: string | null;
  month: string | null;
  year: string | null;
  appointment: string | null;
  period: string[] | null;
  status: string | number | null;
  note: string;
  image: string;
  images: string[];
  files: FileInfo[];
  rich: string;
  custom: { priority: number; tags: string[] };
}
export interface FormLabContext {
  organizationId: OrganizationId;
  canEdit: boolean;
  showAttachments: boolean;
  dictCode: string;
}
export interface FormLabQuery {
  keyword: string;
  minimum: number | null;
  enabled: boolean;
  period: string[] | null;
}
