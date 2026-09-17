import type { FileInfo } from "@/api/file/types";
import type {
  MeetingAgendaItem,
  MeetingApplicationStatus,
  MeetingAttendeeItem,
  MeetingBudgetItem,
} from "@/api/task/meeting-application/types";
import type { OrganizationScope } from "@/api/master-data/types";

export interface MeetingApplicationPageContext {
  organizationId: OrganizationScope;
}

export interface MeetingApplicationSearchModel {
  keyword: string;
  status: MeetingApplicationStatus | "";
}

export interface MeetingApplicationFormModel {
  id: string | null;
  applyCode: string;
  version: number;
  meetingDate: string;
  principalPartyId: string | null;
  providerPartyId: string | null;
  projectId: string | null;
  serviceItemId: string | null;
  inventoryId: string | null;
  targetType: "outlet" | "customer";
  targetId: string | null;
  meetingName: string;
  serviceTitle: string;
  address: string;
  controlLocation: boolean;
  longitude: string;
  latitude: string;
  amount: string;
  budgetTotal: string;
  attachments: FileInfo[];
  remark: string;
  status: MeetingApplicationStatus;
  budgets: MeetingBudgetItem[];
  attendees: MeetingAttendeeItem[];
  agenda: MeetingAgendaItem[];
  createdBy: string;
  createdTime: string;
}

