import type { Customer, Contact, Product, LabControls } from "../src/api/reference-lab/types";
import { parseDate, DATE_FORMAT } from "../src/utils/date";
import { normalizeSearchText } from "../src/utils/string";

// 固定数据，不依赖时间或随机数；A/B 组织严格交替，数值 0 属于 org-a。
export const customers: Customer[] = Array.from({ length: 200 }, (_, id) => ({
  id,
  code: `C${String(id).padStart(4, "0")}`,
  name:
    id < 4
      ? "同名客户"
      : id === 4
        ? "用于验证固定列与省略显示的超长客户名称".repeat(3)
        : `客户 ${id}`,
  organizationId: id % 2 ? "org-b" : "org-a",
  active: id % 17 !== 16,
  region: id % 2 ? "华南" : "华东",
}));
export const contacts: Contact[] = Array.from({ length: 100 }, (_, index) => ({
  id: `contact-${index}`,
  code: `L${String(index).padStart(4, "0")}`,
  name: `联系人 ${index}`,
  organizationId: index % 2 ? "org-b" : "org-a",
  active: index % 17 !== 16,
  customerId: index % 10,
  phone: `1380000${String(index).padStart(4, "0")}`,
}));
export const products: Product[] = Array.from({ length: 500 }, (_, index) => ({
  id: index === 0 ? "0" : `product-${index}`,
  code: `P${String(index).padStart(4, "0")}`,
  name: `商品 ${index}`,
  organizationId: index % 2 ? "org-b" : "org-a",
  active: index % 17 !== 16,
  price: index * 10,
  listedDate: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
}));

type LabRow = Customer | Contact | Product;
const sources: Record<string, readonly LabRow[]> = { customers, contacts, products };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("请求必须为对象");
  return value as Record<string, unknown>;
}

function scopedRows(source: string, rawFilters: unknown): readonly LabRow[] {
  const rows = sources[source];
  if (!rows) throw new Error("未知实验 source");
  const filters = object(rawFilters);
  if (filters.organizationId !== "org-a" && filters.organizationId !== "org-b") {
    throw new Error("必须指定有效组织范围");
  }
  const allowedKeys = source === "contacts" ? ["organizationId", "customerId"] : ["organizationId"];
  if (Object.keys(filters).some((key) => !allowedKeys.includes(key)))
    throw new Error("未知范围条件");
  const scoped = rows.filter((row) => row.organizationId === filters.organizationId);
  if (source !== "contacts") return scoped;
  // 未选客户不放开范围；0 为合法客户键，且不可跨组织查询联系人。
  if (filters.customerId === null) return [];
  if (typeof filters.customerId !== "number" || !Number.isSafeInteger(filters.customerId)) {
    throw new Error("联系人 customerId 必须为数值 ID 或 null");
  }
  if (
    !customers.some(
      (row) =>
        row.id === filters.customerId && row.organizationId === filters.organizationId && row.active
    )
  )
    return [];
  return scoped.filter((row) => "customerId" in row && row.customerId === filters.customerId);
}

export function readLabControls(value: unknown): LabControls {
  const control = value === undefined ? {} : object(value);
  const delayMs = control.delayMs ?? 50;
  if (delayMs !== 50 && delayMs !== 300 && delayMs !== 1500) throw new Error("无效延迟");
  for (const key of ["fail", "empty", "duplicate", "partialUnavailable", "failResolve"]) {
    if (control[key] !== undefined && typeof control[key] !== "boolean")
      throw new Error("无效测试开关");
  }
  const extra = Object.fromEntries(
    ["duplicate", "partialUnavailable", "failResolve"]
      .filter((key) => control[key] !== undefined)
      .map((key) => [key, control[key]])
  );
  return { delayMs, fail: control.fail === true, empty: control.empty === true, ...extra };
}

/** 仅实现当前三个实验 source 声明的筛选，不是通用查询语言解释器。 */
export function searchLab(source: string, value: unknown, empty = false, duplicate = false) {
  const query = object(value);
  let rows = scopedRows(source, query.filters);
  const { pageNum, pageSize } = query;
  if (
    typeof pageNum !== "number" ||
    !Number.isSafeInteger(pageNum) ||
    pageNum < 1 ||
    typeof pageSize !== "number" ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new Error("分页范围无效");
  if (
    typeof query.keyword !== "string" ||
    (query.purpose !== "suggest" && query.purpose !== "dialog")
  )
    throw new Error("关键字或请求用途无效");
  const keyword = normalizeSearchText(query.keyword);
  rows = rows.filter((row) => normalizeSearchText(`${row.code} ${row.name}`).includes(keyword));
  if (!Array.isArray(query.conditions)) throw new Error("conditions 必须是数组");
  for (const rawCondition of query.conditions) {
    const condition = object(rawCondition);
    if (
      (condition.key === "name" || condition.key === "code") &&
      condition.operator === "contains" &&
      typeof condition.value === "string"
    ) {
      const key = condition.key;
      const search = normalizeSearchText(condition.value);
      rows = rows.filter((row) => normalizeSearchText(row[key]).includes(search));
    } else if (
      condition.key === "active" &&
      condition.operator === "eq" &&
      typeof condition.value === "boolean"
    ) {
      rows = rows.filter((row) => row.active === condition.value);
    } else if (
      source === "products" &&
      condition.key === "listedDate" &&
      condition.operator === "between" &&
      Array.isArray(condition.value) &&
      condition.value.length === 2 &&
      condition.value.every(
        (value) => typeof value === "string" && parseDate(value, DATE_FORMAT) !== null
      ) &&
      condition.value[0] <= condition.value[1]
    ) {
      const [from, to] = condition.value;
      rows = rows.filter(
        (row) => "listedDate" in row && row.listedDate >= from && row.listedDate <= to
      );
    } else {
      throw new Error("查询条件不在 source 白名单中");
    }
  }
  let sorted = [...rows];
  if (query.sort !== undefined) {
    const sort = object(query.sort);
    const key = sort.key;
    if (
      (key !== "code" && key !== "name" && !(source === "products" && key === "price")) ||
      (sort.order !== "asc" && sort.order !== "desc")
    )
      throw new Error("排序不在 source 白名单中");
    const direction = sort.order === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      if (key === "price" && "price" in a && "price" in b) return direction * (a.price - b.price);
      const textKey = key === "name" ? "name" : "code";
      return direction * a[textKey].localeCompare(b[textKey], "zh-CN");
    });
  }
  if (empty) sorted = [];
  const list = sorted.slice((pageNum - 1) * pageSize, pageNum * pageSize);
  if (duplicate && list.length > 1) list[list.length - 1] = list[0];
  return { list, total: sorted.length };
}

export function resolveLab(
  source: string,
  rawIds: unknown,
  filters: unknown,
  empty = false,
  partialUnavailable = false,
  duplicate = false
) {
  const rows = scopedRows(source, filters);
  if (!Array.isArray(rawIds) || rawIds.length > 100) throw new Error("回显 ID 数组最多 100 项");
  const expectedType = source === "customers" ? "number" : "string";
  const ids: (string | number)[] = rawIds.map((id: unknown) => {
    if (
      typeof id !== expectedType ||
      (typeof id === "number" && !Number.isSafeInteger(id)) ||
      (typeof id === "string" && !id.trim())
    )
      throw new Error("回显 ID 类型或值无效");
    // 上面已验证类型；明确收窄后返回，避免把未知请求值当作业务数据。
    if (typeof id !== "string" && typeof id !== "number") throw new Error("无效 ID");
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error("回显请求 ID 必须去重");
  const items: LabRow[] = [];
  const unavailableIds: (string | number)[] = [];
  for (const id of ids) {
    const record =
      empty || (partialUnavailable && id === ids[0])
        ? undefined
        : rows.find((row) => row.id === id && row.active);
    if (record) items.push(record);
    else unavailableIds.push(id);
  }
  if (duplicate && items.length) items.push(items[0]);
  return { items, unavailableIds };
}
