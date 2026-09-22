import type { CrudFormSlots } from "../../src/components/business/crud/types";
import { useCrudView } from "../../src/composables/useCrudView";
import type { CrudFormViewOptions } from "../../src/components/business/crud/crud-view";
import type { CrudFormPageOptions } from "../../src/components/business/crud/crud-page";
import type { CustomerContract } from "../../src/pages/base/customer/types";
import { useCrudPage } from "../../src/composables/useCrudPage";
import { customerModule } from "../../src/pages/base/customer/config";
import type { RichTextProps } from "../../src/components/business/fields/rich-text";

const add = useCrudPage(customerModule, {
  view: "add",
  state: () => ({ hint: "", count: 0 }),
  hooks: {
    beforeOpen: async ({ context, state, target }) => {
      context.organizationId satisfies "org-a";
      state.count satisfies number;
      target.mode satisfies "add";
      // @ts-expect-error 钩子状态快照只读
      state.count = 1;
      return { state: { hint: "加载完毕" }, defaults: { customerName: "新客户" } };
    },
    validate: async ({ model }) => {
      model.customerName satisfies string;
      // @ts-expect-error 模型快照只读
      model.customerName = "错误";
      return { valid: true };
    },
  },
});
add.state.count = 1;
// @ts-expect-error state 类型不应拓宽
add.state.count = "wrong";
// @ts-expect-error patch 必须匹配字段
add.form.patch({ customerName: 42 });
// @ts-expect-error 新增页不暴露列表控制器
add.list.refresh();
const invalidEdit: CrudFormPageOptions<CustomerContract, object, "edit"> = {
  view: "edit",
  hooks: {
    // @ts-expect-error 编辑不能返回新增默认值，即使同时包含 state
    beforeOpen: async () => ({ state: {}, defaults: { customerName: "不能覆盖" } }),
  },
};
useCrudPage(customerModule, invalidEdit);
const detail = useCrudPage(customerModule, { view: "detail" });
// @ts-expect-error 详情不提供保存控制器
detail.form.save();
const rich: RichTextProps = { height: "320px", maxlength: 2000, readonlyDisplay: "html" };
// @ts-expect-error 富文本不混用 textarea 的 rows
rich.rows = 3;
// @ts-expect-error readonlyDisplay 有明确允许值
rich.readonlyDisplay = "unsafe";

const { state, actions, bindings } = useCrudView(customerModule, {
  view: "add",
  state: () => ({ reviewed: false }),
  hooks: {
    beforeSave: async ({ state }) =>
      state.custom.reviewed ? { proceed: true } : { proceed: false, reason: "请核对" },
    change: async ({ field, model, previous, changes, state, signal }) => {
      field satisfies keyof typeof model;
      state.custom.reviewed satisfies boolean;
      model.customerName satisfies string;
      previous.customerName satisfies string;
      changes.customerName satisfies string | undefined;
      signal.throwIfAborted();
      // @ts-expect-error change 输入是只读快照
      model.customerName = "wrong";
      return { state: { reviewed: false }, patch: { shortName: model.customerName.slice(0, 30) } };
    },
  },
});
state.custom.reviewed = true;
// @ts-expect-error 自定义状态保留精确类型
state.custom.reviewed = "wrong";
// @ts-expect-error 模型只读，必须走 patch
state.model.customerName = "wrong";
actions.patch({ customerName: "正确" });
// @ts-expect-error patch 不允许错误字段类型
actions.patch({ customerName: 42 });
// @ts-expect-error 表单没有列表分页命令
actions.setPage(1, 20);
bindings.child("contacts").rows[0]?.phone satisfies string | undefined;
// @ts-expect-error 普通字段不是子表 key
bindings.child("customerName");
const detailView = useCrudView(customerModule, { view: "detail" });
// @ts-expect-error 详情不能保存
detailView.actions.save();
const listView = useCrudView(customerModule, { view: "list" });
listView.state.pagination.pageNum satisfies number;
// @ts-expect-error 分页只能通过命令修改
listView.state.pagination.pageNum = 2;
listView.actions.setPage(2, 20);
const invalidView: CrudFormViewOptions<CustomerContract, object, "edit"> = {
  view: "edit",
  hooks: {
    // @ts-expect-error 编辑初始化不得覆盖服务端模型
    beforeOpen: async () => ({ state: {}, defaults: { customerName: "wrong" } }),
  },
};
useCrudView(customerModule, invalidView);

// 整体回填版本保留控制器状态类型与悬停说明。
const hydrationRevision: number = state.hydrationRevision;
void hydrationRevision;

const formSlots: CrudFormSlots<
  CustomerContract["Model"],
  CustomerContract["Entity"],
  CustomerContract["Id"]
> = {
  header: ({ state }) => state.model.customerName,
};
void formSlots;

state.canSave satisfies boolean;
bindings.fields.controller.state.model.customerName satisfies string;
bindings.fields.controller.focusIssue({ field: "customerName", message: "名称必填" });
bindings.fields.controller.focusIssue(bindings.fields.controller.state.issues[0]);
// @ts-expect-error 错误定位只能指向模型字段
bindings.fields.controller.focusIssue({ field: "missingField", message: "错误" });
