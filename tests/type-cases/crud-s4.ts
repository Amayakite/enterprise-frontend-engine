// 仅供 S4 编译验收；不进入应用，不发送请求。
import type {
  CrudChildTableChange,
  CrudListConfig,
} from "@/components/business/crud/types";
import type { CustomerRecord } from "@/api/base/customer/types";

const schema = {
  name: {
    label: "名称",
    kind: "text",
    entries: ["quick"],
    operators: ["contains"],
  },
} as const;
interface Context {
  organizationId: string;
}
interface Scope {
  organizationId: string;
}
type List = CrudListConfig<
  CustomerRecord,
  string,
  typeof schema,
  Scope,
  { pageNum: number },
  Context
>;
const list: List = {
  getKey: (row) => row.id,
  columns: [{ key: "customerName", label: "客户" }],
  query: { schema, initial: { quick: [], normal: [], advanced: null } },
  scope: (context) => ({ key: context.organizationId, value: context }),
  toQuery: (request) => ({ pageNum: request.pageNum }),
  request: async () => ({ list: [], total: 0 }),
  editDisabledReason: (row) => (row.status === "approved" ? "已审核" : undefined),
};
const change: CrudChildTableChange<{ id: string; primary: boolean }, string> = {
  type: "patch",
  key: "row-1",
  changes: { primary: true },
};
const wrongKey: CrudChildTableChange<{ id: string; primary: boolean }, string> = {
  type: "remove",
  // @ts-expect-error 子表变更的行键必须保持配置类型
  key: 1,
};
const wrongReason: List = {
  ...list,
  // @ts-expect-error 编辑禁用原因必须返回文案或 undefined
  editDisabledReason: () => true,
};
void [list, change, wrongKey, wrongReason];
