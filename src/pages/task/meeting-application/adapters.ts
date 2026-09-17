import type {
  MeetingApplicationItem,
  MeetingApplicationQueryParams,
  MeetingApplicationSavePayload,
} from "@/api/task/meeting-application/types";
import { formatDate } from "@/utils/date";
import { toFixedDecimal } from "@/utils/decimal";
import type {
  MeetingApplicationFormModel,
  MeetingApplicationSearchModel,
} from "./types";

export function createInitialMeetingApplicationSearch(): MeetingApplicationSearchModel {
  return { keyword: "", status: "" };
}

export function createInitialMeetingApplicationForm(): MeetingApplicationFormModel {
  return {
    id: null,
    applyCode: "",
    version: 0,
    meetingDate: formatDate(new Date()),
    principalPartyId: null,
    providerPartyId: null,
    projectId: null,
    serviceItemId: null,
    inventoryId: null,
    targetType: "outlet",
    targetId: null,
    meetingName: "",
    serviceTitle: "",
    address: "",
    controlLocation: false,
    longitude: "",
    latitude: "",
    amount: "",
    budgetTotal: "0.00",
    attachments: [],
    remark: "",
    status: "draft",
    budgets: [],
    attendees: [],
    agenda: [],
    createdBy: "",
    createdTime: "",
  };
}

export function toMeetingApplicationQuery(
  model: MeetingApplicationSearchModel,
  pageNum: number,
  pageSize: number
): MeetingApplicationQueryParams {
  return { pageNum, pageSize, keyword: model.keyword.trim(), status: model.status };
}

export function toMeetingApplicationForm(
  item: MeetingApplicationItem
): MeetingApplicationFormModel {
  return {
    id: item.id,
    applyCode: item.applyCode,
    version: item.version,
    meetingDate: item.meetingDate,
    principalPartyId: item.principalPartyId,
    providerPartyId: item.providerPartyId,
    projectId: item.projectId,
    serviceItemId: item.serviceItemId,
    inventoryId: item.inventoryId,
    targetType: item.targetType,
    targetId: item.targetId,
    meetingName: item.meetingName,
    serviceTitle: item.serviceTitle,
    address: item.address,
    controlLocation: item.controlLocation,
    longitude: item.longitude,
    latitude: item.latitude,
    amount: item.amount,
    budgetTotal: item.budgetTotal,
    attachments: structuredClone(item.attachments),
    remark: item.remark,
    status: item.status,
    budgets: structuredClone(item.budgets),
    attendees: structuredClone(item.attendees),
    agenda: structuredClone(item.agenda),
    createdBy: item.createdBy,
    createdTime: item.createdTime,
  };
}

export function toMeetingApplicationPayload(
  model: MeetingApplicationFormModel
): MeetingApplicationSavePayload {
  if (
    !model.principalPartyId ||
    !model.providerPartyId ||
    !model.projectId ||
    !model.serviceItemId ||
    !model.inventoryId
  )
    throw new Error("会议申请参照字段不完整");
  return {
    meetingDate: model.meetingDate,
    principalPartyId: model.principalPartyId,
    providerPartyId: model.providerPartyId,
    projectId: model.projectId,
    serviceItemId: model.serviceItemId,
    inventoryId: model.inventoryId,
    targetType: model.targetType,
    targetId: model.targetId,
    meetingName: model.meetingName.trim(),
    serviceTitle: model.serviceTitle.trim(),
    address: model.address.trim(),
    controlLocation: model.controlLocation,
    longitude: model.longitude.trim(),
    latitude: model.latitude.trim(),
    amount: toFixedDecimal(model.amount),
    attachments: structuredClone(model.attachments),
    remark: model.remark.trim(),
    budgets: model.budgets.map((item) => ({
      ...item,
      estimatedAmount: toFixedDecimal(item.estimatedAmount),
      remark: item.remark.trim(),
    })),
    attendees: structuredClone(model.attendees),
    agenda: structuredClone(model.agenda),
  };
}

