import { cloneModel } from "@/components/business/fields/model";
import type { FormLabModel, FormLabQuery } from "./types";

export function createInitialModel(): FormLabModel {
  return {
    customerId: null,
    customerName: "",
    contactId: null,
    contactName: "",
    contactPhone: "",
    title: "",
    amount: 0,
    enabled: false,
    date: null,
    month: null,
    year: null,
    appointment: null,
    period: null,
    status: null,
    note: "",
    image: "",
    images: [],
    files: [],
    rich: "",
    custom: { priority: 0, tags: [] },
  };
}
export function createInitialQuery(): FormLabQuery {
  return { keyword: "", minimum: null, enabled: false, period: null };
}

/** 演示提交白名单；实际后端 DTO 待联调，展示名称和自定义标签不直接透传。 */
export function toSavePayload(model: FormLabModel) {
  return {
    customerId: model.customerId,
    contactId: model.contactId,
    title: model.title.trim(),
    amount: model.amount,
    enabled: model.enabled,
    businessDate: model.date,
    appointment: model.appointment,
    period: cloneModel(model.period),
    status: model.status,
    note: model.note,
    image: model.image,
    images: [...model.images],
    files: cloneModel(model.files),
    rich: model.rich,
    priority: model.custom.priority,
  };
}
export function toQueryPayload(query: FormLabQuery) {
  return {
    ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
    ...(query.minimum !== null ? { minimum: query.minimum } : {}),
    enabled: query.enabled,
    ...(query.period?.length === 2 ? { startDate: query.period[0], endDate: query.period[1] } : {}),
  };
}
