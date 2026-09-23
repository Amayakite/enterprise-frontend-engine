import { defineModuleFields } from "../../src/components/business/crud/module-fields";
import { defineAggregateBinding } from "../../src/components/business/crud/aggregate";
import { customerModule } from "../../src/pages/base/customer/config";

interface Model {
  name: string;
  items: { name: string }[];
}
interface DTO {
  details: { title: string }[];
  count: number;
}
const schema = {
  name: { label: "名称", kind: "text", operators: ["eq"], entries: ["normal"] },
} as const;
const fields = defineModuleFields<Model, undefined, typeof schema>();
fields([
  {
    key: "name",
    type: "text",
    label: "名称",
    scenes: { list: { minWidth: 100 }, edit: { required: true } },
  },
]);
// @ts-expect-error 字段必须属于主模型
fields([{ key: "missing", type: "text", label: "错误", scenes: {} }]);
// @ts-expect-error 字符串不能使用 boolean 开关控件
fields([{ key: "name", type: "switch", label: "错误", scenes: {} }]);
// @ts-expect-error 不存在的查询字段
fields([{ key: "name", type: "text", label: "名称", scenes: { query: { key: "missing" } } }]);
// @ts-expect-error 列表链接只能使用 detail 或 edit
fields([{ key: "name", type: "text", label: "名称", scenes: { list: { link: "other" } } }]);

const bind = defineAggregateBinding<Model, DTO>();
const config = {
  title: "明细",
  validateRows: (_rows: Model["items"]) => [],
  persistence: {
    mode: "aggregate" as const,
    toPayload: (rows: Model["items"]) => rows.map((row) => ({ title: row.name })),
  },
};
const binding = bind({ modelKey: "items", payloadKey: "details", config });
const key: "items" = binding.modelKey;
const payload: DTO["details"] = binding.toPayload({ name: "", items: [] });
// @ts-expect-error 主模型的普通字段不能绑定子表
bind({ modelKey: "name", payloadKey: "details", config });
// @ts-expect-error 请求里的非数组字段不能承载子表
bind({ modelKey: "items", payloadKey: "count", config });
bind({
  modelKey: "items",
  payloadKey: "details",
  config: {
    ...config,
    // @ts-expect-error 子表转换结果必须匹配目标 DTO 数组
    persistence: { mode: "aggregate", toPayload: (rows: Model["items"]) => rows },
  },
});
const runtime = customerModule.createViewConfig({}, "edit");
runtime.form.fields;
runtime.list.columns;
runtime.detail.fields;
customerModule.children.contacts.config.draft;
runtime.form.create(
  // @ts-expect-error API 请求与 DTO 类型必须保持关联
  { bad: true },
  { signal: new AbortController().signal, context: { organizationId: "org-a", scopeKey: "x" } }
);
void [key, payload];
const autoFields = defineModuleFields<
  { name: string; price: string; active: boolean },
  undefined,
  import("../../src/components/business/search/types").QuerySchema
>();
autoFields([
  { key: "name", type: "text", label: "名称", scenes: { query: { normal: true, keyword: true } } },
]);
autoFields([
  {
    key: "price",
    type: "amount",
    label: "金额",
    scenes: { query: { operators: ["between", "gte"] } },
  },
]);
autoFields([
  // @ts-expect-error 金额不可使用 contains
  { key: "price", type: "amount", label: "金额", scenes: { query: { operators: ["contains"] } } },
]);
autoFields([
  // @ts-expect-error 布尔值不能参加文本关键词
  { key: "active", type: "switch", label: "启用", scenes: { query: { keyword: true } } },
]);
// @ts-expect-error 显式操作符覆盖不能为空
autoFields([{ key: "name", type: "text", label: "名称", scenes: { query: { operators: [] } } }]);
