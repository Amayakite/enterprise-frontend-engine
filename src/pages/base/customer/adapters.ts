import type { CustomerRecord, CustomerSavePayload } from "@/api/base/customer/types";
import { cloneModel } from "@/components/business/fields/model";
import type { AggregatePayloadBindings } from "@/components/business/crud/aggregate";
import type { CustomerFormModel } from "./types";

/**
 * 返回客户新增初始值；只读审计字段有占位值，不进入保存 DTO。
 * @returns 全新主模型与空联系人、地址数组。
 */
export function createCustomerForm(): CustomerFormModel {
  return {
    saleId: null,
    saleName: "",
    customerName: "",
    shortName: "",
    customerType: "distributor",
    creditCode: "",
    phone: "",
    provinceId: null,
    cityId: null,
    districtId: null,
    address: "",
    remark: "",
    contacts: [],
    addresses: [],
    status: "pending",
    id: "",
    customerCode: "",
    provinceName: "",
    cityName: "",
    districtName: "",
    active: true,
    createdBy: "",
    createdTime: "",
    updatedTime: "",
    version: 0,
  };
}
/** 回显模型同时承载只读展示字段；保存由 toCustomerPayload 白名单隔离。 */
export function toCustomerForm(row: CustomerRecord): CustomerFormModel {
  return cloneModel({
    saleId: row.saleId,
    saleName: row.saleName,
    customerName: row.customerName,
    shortName: row.shortName,
    customerType: row.customerType,
    creditCode: row.creditCode,
    phone: row.phone,
    provinceId: row.provinceId,
    cityId: row.cityId,
    districtId: row.districtId,
    address: row.address,
    remark: row.remark,
    contacts: row.contacts,
    addresses: row.addresses,
    status: row.status,
    id: row.id,
    customerCode: row.customerCode,
    provinceName: row.provinceName,
    cityName: row.cityName,
    districtName: row.districtName,
    active: row.active,
    createdBy: row.createdBy,
    createdTime: row.createdTime,
    updatedTime: row.updatedTime,
    version: row.version,
  });
}
/**
 * 从客户页面模型生成整单保存白名单；展示字段、状态和审计信息不提交。
 * @param form 公共模型工厂传入的隔离副本。
 * @param children 主 config 内登记的子表绑定；通过参数传入，避免反向导入 config。
 * @throws 未完整选择省市区时阻止构建 DTO。
 * @example
 * `toPayload: model => toCustomerPayload(model, children)`
 */
export function toCustomerPayload(
  form: CustomerFormModel,
  children: AggregatePayloadBindings<CustomerFormModel, CustomerSavePayload>
): CustomerSavePayload {
  if (!form.provinceId || !form.cityId || !form.districtId)
    throw new Error("请完整选择省、市、区县");
  if (!form.saleId) throw new Error("请选择销售组织");
  return {
    saleId: form.saleId,
    customerName: form.customerName.trim(),
    shortName: form.shortName.trim(),
    customerType: form.customerType,
    creditCode: form.creditCode.trim(),
    phone: form.phone.trim(),
    provinceId: form.provinceId,
    cityId: form.cityId,
    districtId: form.districtId,
    address: form.address.trim(),
    remark: form.remark.trim(),
    [children.contacts.payloadKey]: children.contacts.toPayload(form),
    [children.addresses.payloadKey]: children.addresses.toPayload(form),
  };
}
