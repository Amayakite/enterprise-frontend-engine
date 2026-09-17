import type { FileInfo } from "@/api/file/types";
import type { BaseQueryParams } from "@/types/http";

export type MeetingApplicationStatus = "draft" | "pending" | "approved" | "rejected";

export interface MeetingApplicationQueryParams extends BaseQueryParams {
  keyword?: string;
  status?: MeetingApplicationStatus | "";
  sortKey?: keyof Pick<MeetingApplicationItem, "applyCode" | "meetingDate" | "amount">;
  sortOrder?: "asc" | "desc";
}

export interface MeetingBudgetItem {
  id: string;
  budgetType: string;
  estimatedAmount: string;
  remark: string;
}

export interface MeetingAttendeeItem {
  id: string;
  candidateId: string | null;
  name: string;
  mobile: string;
  checkinStatus: "pending" | "checked";
  checkinTime: string;
  feedback: string;
}

export interface MeetingAgendaItem {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  speaker: string;
}

export interface ApprovalTimelineItem {
  id: string;
  nodeName: string;
  operatorName: string;
  result: "created" | "pending" | "approved" | "rejected";
  comment: string;
  operatedAt: string;
}

export interface MeetingApplicationItem {
  id: string;
  applyCode: string;
  meetingDate: string;
  principalPartyId: string;
  principalPartyName: string;
  providerPartyId: string;
  providerPartyName: string;
  projectId: string;
  projectName: string;
  serviceItemId: string;
  serviceItemName: string;
  inventoryId: string;
  inventoryName: string;
  targetType: "outlet" | "customer";
  targetId: string | null;
  targetName: string;
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
  version: number;
}

export interface MeetingApplicationSavePayload {
  meetingDate: string;
  principalPartyId: string;
  providerPartyId: string;
  projectId: string;
  serviceItemId: string;
  inventoryId: string;
  targetType: "outlet" | "customer";
  targetId: string | null;
  meetingName: string;
  serviceTitle: string;
  address: string;
  controlLocation: boolean;
  longitude: string;
  latitude: string;
  amount: string;
  attachments: FileInfo[];
  remark: string;
  budgets: MeetingBudgetItem[];
  attendees: MeetingAttendeeItem[];
  agenda: MeetingAgendaItem[];
}

export interface MeetingApplicationSaveResult {
  id: string;
  applyCode: string;
  version: number;
}

export interface MeetingApplicationActionResult {
  affectedIds: string[];
}
