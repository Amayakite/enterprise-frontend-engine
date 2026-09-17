import { CustomerLabAPI, ContactLabAPI, ProductLabAPI } from "@/api/reference-lab";
import type {
  Customer,
  Contact,
  Product,
  OrganizationFilters,
  ContactFilters,
} from "@/api/reference-lab/types";
import type {
  ReferenceSource,
  ReferenceSearchField,
} from "@/components/business/MyReference/types";

const searchFields: readonly ReferenceSearchField[] = [
  { key: "code", label: "编码", type: "text", operator: "contains" },
  { key: "name", label: "名称", type: "text", operator: "contains" },
  {
    key: "active",
    label: "状态",
    type: "select",
    operator: "eq",
    options: [
      { label: "启用", value: true },
      { label: "停用", value: false },
    ],
  },
];

export const customerSource: ReferenceSource<Customer, number, OrganizationFilters> = {
  key: "lab.customer",
  title: "客户",
  getKey: (row) => row.id,
  getLabel: (row) => row.name,
  getDescription: (row) => `${row.code} · ${row.region}`,
  columns: [
    { key: "code", label: "编码", width: 140 },
    { key: "name", label: "名称", minWidth: 200 },
  ],
  searchFields,
  search: CustomerLabAPI.search,
  resolve: CustomerLabAPI.resolve,
  selectable: (row) => ({ allowed: row.active, reason: row.active ? undefined : "客户已停用" }),
};

export const contactSource: ReferenceSource<Contact, string, ContactFilters> = {
  key: "lab.contact",
  title: "联系人",
  getKey: (row) => row.id,
  getLabel: (row) => row.name,
  columns: [
    { key: "code", label: "编码" },
    { key: "name", label: "姓名" },
    { key: "phone", label: "电话" },
  ],
  searchFields,
  search: ContactLabAPI.search,
  resolve: ContactLabAPI.resolve,
  selectable: (row) => ({ allowed: row.active, reason: row.active ? undefined : "联系人已停用" }),
};

export const productSource: ReferenceSource<Product, string, OrganizationFilters> = {
  key: "lab.product",
  title: "商品",
  getKey: (row) => row.id,
  getLabel: (row) => row.name,
  getDescription: (row) => `${row.code} · ${row.listedDate}`,
  columns: [
    { key: "code", label: "编码" },
    { key: "name", label: "名称" },
    { key: "listedDate", label: "上架日期", width: 130 },
    { key: "price", label: "单价", sortable: true },
  ],
  searchFields: [
    ...searchFields,
    { key: "listedDate", label: "上架日期", type: "dateRange", operator: "between" },
  ],
  search: ProductLabAPI.search,
  resolve: ProductLabAPI.resolve,
  selectable: (row) => ({ allowed: row.active, reason: row.active ? undefined : "商品已停用" }),
};
