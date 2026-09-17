# 模块开发实操：从 Customer 的一个配置入口开始

目录边界与默认规则见 [模块规范](./business-module-standard.md)。
当前完整示例从 [customer/config.ts](../src/pages/base/customer/config.ts) 进入：
主字段、联动、查询和子表归属直接可见，不需要先翻多个配置分片。

只需要最简单的无子表模块时，先看 [Sale 示例](./sale-example.md)与
[sale/config.ts](../src/pages/base/sale/config.ts)：四个路由页只选择 view，
不包含 Customer 的业务演示钩子；复杂主子表仍按本文组织。

## 1. 默认结构

```text
src/api/base/customer/
  index.ts              请求/响应协议适配，透传 signal
  types.ts              Entity、新增/编辑整单 DTO、子行 DTO
  query.ts              查询字段、运算符、排序白名单
src/pages/base/customer/
  config.ts             唯一模块入口；主 fields/links/children 直接内联
  types.ts              页面模型、上下文、继承公共合同的 CustomerContract
  adapters.ts           初始值、回显、整单白名单转换
  index.vue/detail.vue   各自调用 useCrudView，直接使用列表/详情组件
  add.vue/edit.vue       各自调用 useCrudView，显式装配表单和子表
  children/
    types.ts            客户专属子表合同
    contacts/config.ts  联系人自己的字段、编辑方式、校验、行 DTO 转换
    addresses/config.ts 地址自己的完整配置
```

复杂子表可有自己的 Vue 呈现组件。主字段只有明显过大且确有维护收益才拆 fields.config.ts；
简单示例不要为了“解耦”预建配置分片。子表配置独立是业务职责边界，不能取消。

## 2. 类型：明确继承，不在 config 顶部堆合同

完整合同见 [types.ts](../src/pages/base/customer/types.ts)，以下为节选：

```ts
export interface CustomerContract extends BusinessModuleContract {
  /** 本模块的统一页面模型，地区 ID 可空。 */
  Model: CustomerFormModel;
  /** API 返回的客户实体，含乐观锁版本。 */
  Entity: CustomerRecord;
  /** 当前接口使用字符串 ID。 */
  Id: string;
  // Schema、Scope、Query、Create、Update、Result、Context 同样显式具体化并写注释。
}
```

公共合同定义“需要哪些角色”，业务合同填入“每个角色是什么类型”。
不能直接用宽泛的 BusinessModuleContract 替代具体合同，否则字段和 API 提示会丢失。

## 3. 配置大字段保持固定顺序并逐段说明

```ts
export const customerModule = defineBusinessModule<CustomerContract>()({
  /** 稳定模块身份，供草稿、偏好和失效刷新共用。 */
  meta: { key: "customer", title: "客户管理" },
  /** 读取/整单保存适配，URL 和响应外壳只在 API 层处理。 */
  api: apiOptions,
  /** 公共模型工厂处理默认流程，业务声明 DTO 差异。 */
  model: (children) =>
    defineBusinessModel<CustomerContract>()({
      create: createCustomerForm,
      fromRecord: toCustomerForm,
      getKey: (record) => record.id,
      toPayload: (model) => toCustomerPayload(model, children),
      updatePayload: (payload, input) => ({ ...payload, version: input.baseline.version }),
      resolveSaved: async (record) => record,
    }),
  /** 一套主字段，按场景派生。 */
  fields: [
    {
      key: "customerName",
      label: "客户名称",
      type: "text",
      form: { required: true, span: 2 },
      props: { maxlength: 100 },
      scenes: {
        list: { minWidth: 180, link: "detail" },
        detail: true,
        query: { normal: true, advanced: true, keyword: true },
      },
    },
  ],
  /** 依赖字段联动，不另维护一份页面状态。 */
  links: [],
  /** 从 fields 查询意图派生界面及统一关键词。 */
  query: { source: "fields" },
  /** 主模型数组到整单 DTO 数组；子行规则仍由独立配置负责。 */
  children: {
    contacts: bindChild({
      modelKey: "contacts",
      payloadKey: "contacts",
      config: customerContactsConfig,
    }),
    addresses: bindChild({
      modelKey: "addresses",
      payloadKey: "addresses",
      config: customerAddressesConfig,
    }),
  },
  /** 分页、权限、草稿、业务动作等场景级策略。 */
  views: viewOptions,
});
```

这是组织方式节选，apiOptions/viewOptions 代表省略的配置段；实际 customer 也将它们内联。
新增/编辑默认继承 form，场景差异写 scenes.add/edit；false 不展示、不执行该场景字段校验。
保存白名单不由可见性推导。列表与详情同样派生，不再维护三份字段数组。

model 工厂参数 children 就是该模块内联登记的绑定；模块初始化时装配一次，不产生共享表单。
公共工厂提供默认副本隔离、toCreate/toUpdate 包装；toPayload 不需要自己 clone readonly 模型。
特殊新增协议可填 overrides.toCreate；未覆盖的步骤继续使用公共默认流程。
覆盖方法的返回值必须满足具体 DTO 合同。

## 4. 动作声明与默认行为

不再建立 actionLabels 和多层 customerActions 分支，直接列业务规则：

```ts
const actions = defineRowCommands<CustomerFormModel, string, CustomerPageContext>()({
  entityLabel: "客户",
  permissionPrefix: "base:customer",
  getLabel: (row) => row.customerName,
  items: [
    {
      key: "approve",
      label: "审核",
      visible: ({ row }) => row.status === "pending",
      request: ({ rowKey, row, signal }) =>
        CustomerAPI.action(rowKey, "approve", row.version, signal),
    },
  ],
});
```

默认生成 base:customer:approve 权限、确认文案和包含 affectedKeys 的成功回执。
危险删除可以自定义 confirm；低层 CrudAction 的 confirm 省略是不确认，
而这个便利工厂省略 confirm 是使用默认确认，false 才关闭。

工厂不发请求，执行仍由 useCrudActions 管理。request 失败向外抛出；
execute 可替代默认请求/回执流程，refresh/afterExecute 控制刷新和跳转。
详情删除成功后关闭页面并用 refresh:none，避免读取已删除实体。

## 5. 子表和保存适配

父 config 内联 children；独立子 config 保留 fields、行键、初始值、编辑方式、
normalizeRows/validateRows、业务 actions 和 persistence.toPayload。

[adapters.ts](../src/pages/base/customer/adapters.ts) 通过参数接收类型化的 children，
不反向读取 config，也不再引入一份独立绑定表：

```ts
// toCustomerPayload(form, children) 返回对象中的子表部分；主表白名单见源码。
const childPayload = {
  [children.contacts.payloadKey]: children.contacts.toPayload(form),
  [children.addresses.payloadKey]: children.addresses.toPayload(form),
};
```

modelKey/payloadKey 均受数组字段约束，子行转换结果必须匹配 DTO。
空数组正常提交，展示/状态/版本字段不会因此自动混入请求。
当前仍通过开发 Mock 的 create/update 整单保存，正式 saveMasterDetail 就绪后在 API 层适配。

## 6. 页面最终形态

Vue 文件顶部说明本页用途；template 直接写真实组件和插槽；script 使用一次
`useCrudView`，按需解构 `state/actions/bindings`。正常页面不写 style，复用公共样式。
`config.ts` 仍是字段、子表和公共规则入口，没有 template/style。

以下是核心接法节选；模块提示、非法 ID 提示的完整装配见四个实际源码文件。
标准列表/详情组件会从 bindings 自动挂载弹窗宿主，页面不要重复挂载。
不要把省略布局的片段当作完整 customer 路由直接替换，尤其不能漏掉已配置子表分区。

### index.vue：列表状态和操作

```vue
<template>
  <MyCrudList v-bind="bindings.list">
    <template #toolbar-left>
      <ActionButton label="刷新客户" :disabled="state.busy" @click="refresh" />
    </template>
  </MyCrudList>
</template>

<script setup lang="ts">
import MyCrudList from "@/components/business/crud/MyCrudList.vue";
import ActionButton from "@/components/business/ActionButton.vue";
import { useCrudView } from "@/composables/useCrudView";
import { customerModule } from "./config";

defineOptions({ name: "CustomerManagement" });
const { state, actions, bindings } = useCrudView(customerModule, { view: "list" });
function refresh() {
  return actions.refresh();
}
</script>
```

实际 [index.vue](../src/pages/base/customer/index.vue) 还演示 `state.custom`、地区列插槽、
选中摘要与批量规则。分页通过 `state.pagination` 读取，`actions.setPage(2, 20)` 更新；
不要额外维护另一份分页或 selectedKeys。

### add.vue：state、hooks 和真实表单

```vue
<template>
  <MyCrudForm v-bind="bindings.form">
    <template #section-contacts>
      <CustomerContacts :binding="contacts" />
    </template>
    <template #section-addresses>
      <CustomerAddresses :binding="addresses" />
    </template>
    <template #footer>
      <el-checkbox v-model="state.custom.reviewed" :disabled="state.busy">
        我已核对客户资料
      </el-checkbox>
    </template>
  </MyCrudForm>
</template>

<script setup lang="ts">
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import CustomerContacts from "./children/contacts/CustomerContacts.vue";
import CustomerAddresses from "./children/addresses/CustomerAddresses.vue";
import { useCrudView } from "@/composables/useCrudView";
import { customerModule } from "./config";

defineOptions({ name: "CustomerAdd" });
const { state, bindings } = useCrudView(customerModule, {
  view: "add",
  state: () => ({
    /** 本次人工核对开关，默认关闭，不进入 DTO 或草稿。 */
    reviewed: false,
  }),
  hooks: {
    beforeSave: async ({ state }) =>
      state.custom.reviewed ? { proceed: true } : { proceed: false, reason: "请先核对客户资料" },
  },
});
const contacts = bindings.child("contacts");
const addresses = bindings.child("addresses");
</script>
```

实际 [add.vue](../src/pages/base/customer/add.vue) 还有 `beforeOpen` 准备备注模板、
`afterOpen` 就绪反馈、`validate` 条件必填、`field-remark` 输入与模板按钮，并通过 `hooks.change` 观察字段确认后的完整模型。
初始化返回 `{ state: { reviewed: false }, defaults: { remark: "..." } }` 时，
state 只合并到 custom；defaults 先于草稿恢复，不覆盖恢复内容。

### edit.vue：独立装配，复用原模型与草稿

[edit.vue](../src/pages/base/customer/edit.vue) 同样显式导入 MyCrudForm 与两个子表组件，
调用 `useCrudView(customerModule, { view: "edit", state, hooks })`。
简称字段插槽通过 `update` 写入，或者在脚本中调用
`actions.patch({ shortName: "客户简称" })`；不能直接赋值 `state.model.shortName`。

编辑 ID 在实例创建时固定。beforeOpen 只能返回辅助 state，不能用 defaults 覆盖服务端回显。
客户编辑页还通过 `form.references.provinceId` 调用共享参照的 `withMap`，只替换本页省份名称回写；
新增页继续使用默认 map，原省市区 links 不变。合同见[组件指南](./business-components-guide.md#页面局部回写覆盖)。
示例还展示载入版本、条件校验、联系人分区扩展，以及 afterSave 成功信息；
保存仍执行同一控制器的版本、子表、草稿和默认导航流程。

### detail.vue：真实详情组件与只读子行

[detail.vue](../src/pages/base/customer/detail.vue) 显式使用：

```vue
<MyCrudDetail v-if="!state.invalidReason" v-bind="bindings.detail">
  <template #actions>
    <ActionButton
      v-if="state.canEdit"
      label="编辑"
      :disabled="state.busy"
      :disabled-reason="state.editReason"
      @click="onEdit"
    />
  </template>
  <template #tab-contacts>
    <CustomerContacts :rows="state.model?.contacts ?? []" />
  </template>
  <template #tab-addresses>
    <CustomerAddresses :rows="state.model?.addresses ?? []" />
  </template>
</MyCrudDetail>
```

脚本调用 `useCrudView(customerModule, { view: "detail" })`，`onEdit` 转发
`actions.edit()`；没有 patch/save。实际示例用 computed 筛选联系人展示，
不修改源数组，并通过动作插槽打开只读联系卡片。

### config.ts、子表与自由扩展

配置的职责不变：context/parseId 适配实例身份，fields/links/children/views 提供共享规则。
客户 ID 仍为字符串；数字 ID 模块自行验证数值及安全范围。

`bindings.child("contacts")` 返回已按子配置创建的同一个端口，必须传给对应子表，
不在页面另建 useCrudTableChild。直接组件方式需要显式写 section/tab 插槽；
旧 MyCrudPage 的自动渲染仍支持“页面插槽 → 子表 view.component → 默认表格”，
但它不是新 customer 的模板入口。

可以自由增加业务组件、事件、custom 状态、生命周期、导航覆盖和字段/子表插槽。
公共配置继续解决标准字段与流程；特殊布局可使用 MyForm 等基础组件，
但需要自行接回主表校验、保存和离开保护，不能同一模型创建第二个控制器。

仅在确有需要时追加 `<style scoped>`，只选择自己的业务 class；
不覆盖 .el-\*、:deep() 或私有 DOM。生命周期与失败语义见
[CRUD 指南](./crud-development-guide.md#统一页面入口与可选生命周期)。

## 7. 验证与悬停

tests/crud-page-contract.test.mjs 验证 state、生命周期、富文本和 Vue 插槽正反向类型，
并使用 TypeScript language service 检查实际调用处悬停。
tests/crud-page.test.mjs 与原控制器测试覆盖组合顺序、取消、ID 和子表绑定，
草稿集成测试覆盖恢复后的 afterOpen。编辑器使用 Vue - Official 与工作区 TypeScript。

当前 API 仍为开发 Mock，正式持久化、权限、事务和 token 均未联调。
