import type { FeeItem, FeeSavePayload } from "@/api/task/fee/types";
import { formatDate } from "@/utils/date";
import { toFixedDecimal } from "@/utils/decimal";
import type { FeeFormModel } from "./types";

export function createInitialFeeForm(): FeeFormModel {
  return {
    id: null,
    billCode: "",
    version: 0,
    billDate: formatDate(new Date()),
    principalPartyId: null,
    providerPartyId: null,
    inventoryId: null,
    businessName: "",
    factoryName: "",
    amount: "",
    attachments: [],
    remark: "",
    status: "draft",
    generatedTaskText: "",
    createdBy: "",
    createdTime: "",
  };
}

export function toFeeForm(item: FeeItem): FeeFormModel {
  return {
    id: item.id,
    billCode: item.billCode,
    version: item.version,
    billDate: item.billDate,
    principalPartyId: item.principalPartyId,
    providerPartyId: item.providerPartyId,
    inventoryId: item.inventoryId,
    businessName: item.businessName,
    factoryName: item.factoryName,
    amount: item.amount,
    attachments: structuredClone(item.attachments),
    remark: item.remark,
    status: item.status,
    generatedTaskText: item.generatedTaskCodes.join("、"),
    createdBy: item.createdBy,
    createdTime: item.createdTime,
  };
}

export function toFeePayload(model: FeeFormModel): FeeSavePayload {
  if (!model.principalPartyId || !model.providerPartyId || !model.inventoryId)
    throw new Error("任务费用参照字段不完整");
  return {
    billDate: model.billDate,
    principalPartyId: model.principalPartyId,
    providerPartyId: model.providerPartyId,
    inventoryId: model.inventoryId,
    amount: toFixedDecimal(model.amount),
    attachments: structuredClone(model.attachments),
    remark: model.remark.trim(),
  };
}
