# 业务组件使用说明

本说明帮助你选择组件、准备参数并接入页面。只需要一个输入框、一项详情或一个参照选择器时，可以直接使用下面的独立组件；需要完整的列表、新增、编辑和详情页时，参考 [CRUD 开发指南](./crud-development-guide.md)。新模块的文件放置和配置写法见 [业务模块开发规范](./business-module-standard.md)。

独立输入和展示组件不会替你保存业务数据。标准 CRUD 会调用你配置的 API；目前 API 使用开发 Mock，重启开发服务后数据会重置。

## 先选择所需能力

基础交互先复用已有组件。标签右键菜单采用 [Reka UI Context Menu](https://reka-ui.com/docs/components/context-menu)
的基础组件，管理键盘选择、焦点返回与边界定位；标签关闭、草稿确认和缓存仍归原 store。
这是借鉴 shadcn-vue 组合方式的局部用法，不建立第二套表单、表格或样式工具链。
单选等已有能力继续使用 Element Plus。项目自有控件共用 `theme.scss` 的
`--ui-control-radius`、`--ui-popover-radius` 和 `--ui-focus-ring`，颜色跟随现有明暗主题。

新增交互优先级为：项目公共组件 → 已安装组件库 → 持续维护的官方/第三方实现 → 必要的自定义代码。
引入依赖前检查维护状态、许可证、框架版本和公开 API；已有列表、滚动、空状态、绘制工具等能力不重复实现。
自定义部分只承担现有能力的缺口，并在接入说明中写清原因。新增布局样式使用项目已有 SCSS 或 UnoCSS，
不再为同类交互另写一套普通 CSS 控件样式；不因此批量改写无关旧样式。

| 场景                     | 入口                                                     | 状态归属与选择原则                                                                                    |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 普通业务弹窗             | `src/components/common/MyDialog.vue`                     | 容器管理尺寸、桌面拖拽、全屏、复位、loading、默认动作和无障碍；业务管理内容与状态                     |
| 标准列表/CRUD/主子表页面 | `MyCrudList`、`MyCrudForm`、`MyCrudDetail` 与 `useCrud*` | CRUD 组件和 useCrud 方法管理查询、分页、动作、保存、脏状态和详情加载；业务模块提供 config、DTO 和导航 |
| 独立客户/商品选择        | `src/components/business/MyReference/index.vue`          | 页面持有 ID；组件管理候选、回显与弹窗草稿                                                             |
| 独立配置式编辑表单       | `src/components/business/MyForm/index.vue`               | 页面持有模型；组件管理快照、校验和联动                                                                |
| 独立查询 / 详情          | `src/components/business/MySearch.vue` / `MyDesc.vue`    | 查询草稿独立；详情仅展示                                                                              |
| 独立列表与行编辑         | `src/components/table/MyTable.vue`                       | 页面持有 rows、分页、排序、选择；组件管理活动行草稿                                                   |
| 仅展示表格内核           | `src/components/table/TableView.vue`                     | 无分页/编辑业务状态；不反向引入字段体系                                                               |

普通业务列表需要查询、分页、权限按钮或列设置时，优先使用 `MyCrudList` 和 `useCrudView`。只需要页面中的一小块内容时，可单独使用 MyReference、MyForm、MyDesc 或 MyTable。完整 CRUD 页面内部也使用这些组件。列表顶部已经提供新增、查询、列设置和 `toolbar-right` 扩展位置，业务页通常只需补充自己的按钮。

`MyDialog` 默认桌面可拖拽、窄屏禁用拖拽，支持全屏/还原并在关闭后复位；默认 footer 提供确认/取消和确认禁用原因，也可用 `footer` 完整替换，`actions` 用于标题栏扩展。参照、查询、系统维护、个人资料、通知、服务申请和子表行编辑等普通生产弹窗均已接入。快捷搜索也复用 `MyDialog`，禁用拖拽和全屏，使用独立输入管理焦点/键盘导航；组件实验页的直接用法仅用于嵌套焦点探针。`MyCrudForm` 未配置 layout 时在顶部显示保存/关闭；使用布局预设时操作移到底部，业务 `footer` 插槽用于追加核对或说明。

把独立表单升级为标准 CRUD 时，保留原字段、source、links、稳定行键和 adapter，再将通用加载/保存/动作交给 `useCrud*`。子表只有参与整单事务时才注册到 `childKeys`；独立保存子表、复杂树表和虚拟滚动组合仍由业务页面单独设计。扩展先用公开插槽，不读取组件私有 refs 或 VXE 内部实例。

长文本 `textarea` 编辑默认显示 2 行，可通过字段 `props.rows` 调整初始行数；内容溢出可滚动，用户可纵向拖动调整高度。公共输入不启用异步自动高度测量，避免草稿恢复、只读切换或关闭浮层期间测量已卸载的文本框。

## 独立使用与组合

“独立”表示可在项目内脱离整页 CRUD 组合使用，并不表示已经发布为无依赖的组件库。
这些组件仍依赖 Vue、Element Plus、项目主题/布局样式、路径别名及现有构建配置；MyTable 还依赖
表格引擎，字典、上传与业务参照还可能依赖公共请求和登录环境。迁到其他项目之前应核对这些依赖，
不能只复制一个 Vue 文件就认为功能完整。

### 按需要选择层级

先看“需要传什么”，再决定是否使用完整 CRUD。表中的 controller 是 `useCrud*` 返回的对象，包含加载状态、数据和保存等方法；bindings 是 `useCrudView` 整理好的组件参数，可直接用 `v-bind` 传入，通常不需要自己逐个构造。

| 能力/入口                                                                | 是否需要 CRUD 控制器                          | 主要输入与输出                                                               | 调用方负责什么                               |
| ------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| [MyForm](../src/components/business/MyForm/index.vue)                    | 否                                            | modelValue、fields、context、初值工厂；更新事件、validate/hydrate 等公开方法 | 加载、保存 API、错误提示、离开保护           |
| [MyFormField](../src/components/business/MyForm/MyFormField.vue)         | 不需要 CRUD，但需要 MyForm 的 field(key) 绑定 | 字段绑定；插槽 value/update/commit/readonly                                  | 同一字段只挂载一次，不自行伪造内部绑定       |
| [MyDesc](../src/components/business/MyDesc.vue)                          | 否                                            | 只读模型、fields、context；按 detail 场景展示                                | 读取实体、加载/失败状态、详情动作            |
| [MyTable](../src/components/table/MyTable.vue)                           | 否                                            | rows、fields、context、稳定行键；分页/排序/选择、行编辑事件                  | 行数据、分页请求、应用行补丁和持久化         |
| [MyReference](../src/components/business/MyReference/index.vue)          | 否                                            | v-model、source、filters、scopeKey；commit/resolve 等事件                    | 合法数据源、范围隔离、需要的业务回写         |
| [MyDialog](../src/components/common/MyDialog.vue)                        | 否                                            | 可见性和公开 props/slots/events                                              | 异步提交锁、保存结果、是否关闭               |
| [MyCrudLayout](../src/components/business/crud/MyCrudLayout.vue)         | 否                                            | toolbar/default/aside/footer 插槽                                            | 内容和业务状态；该组件只管理布局             |
| MyCrudFormFields / Toolbar / Feedback                                    | 是，三者共享一个                              | bindings.fields/toolbar/feedback                                             | 自定义布局；不重复创建控制器或保存流程       |
| MyCrudDetailToolbar / Feedback                                           | 是，共享原详情控制器                          | bindings.toolbar/feedback；description 可给 MyDesc                           | 自定义只读内容与动作位置                     |
| [MyCrudChildTable](../src/components/business/crud/MyCrudChildTable.vue) | 需要聚合编辑 binding                          | 原子表操作接口及子 config；行变化回到主模型                                  | 必需子表挂载、子行规则，整单保存交给父控制器 |
| MyCrudList / Form / Detail                                               | 是                                            | bindings.list/form/detail                                                    | 标准完整页面组合、业务插槽与页面 hooks       |

表格仅展示时不要为它建立 CRUD 模块；子表参与整单保存时优先用 MyCrudChildTable，
不要用普通 MyTable 再手写一套子草稿提交。组件可单独组合，但数据所有者保持唯一。

### 独立表单与详情：完整最小例子

下例是可以放入项目内 Vue 文件的局部资料编辑器，不依赖模块配置或路由。
确认只向父组件发出校验后的值，**没有调用保存 API**；真实接口、提交锁和错误反馈由调用方接入。
字段同时声明 form/detail；原始字段的 table 与模块 fields.scenes.list 是两个层级，不混写。

```vue
<script setup lang="ts">
import { ref } from "vue";
import MyForm from "@/components/business/MyForm/index.vue";
import MyDesc from "@/components/business/MyDesc.vue";
import { defineFields } from "@/components/business/fields/normalize";
import type { MyFormExpose } from "@/components/business/fields/types";

/** 局部编辑模型；此例只编辑标题和数量，没有服务端 ID，也不会保存到服务器。 */
interface Model {
  /** 标题，空字符串为未填写。 */ title: string;
  /** 非负数量，0 是有效值。 */ quantity: number;
}
const initial = (): Model => ({ title: "", quantity: 0 });
const model = ref<Model>(initial());
const form = ref<MyFormExpose<Model>>();
const fields = defineFields<Model, undefined>()([
  { key: "title", label: "标题", type: "text", form: { required: true }, detail: true },
  { key: "quantity", label: "数量", type: "number", props: { min: 0 }, form: {}, detail: true },
]);
const emit = defineEmits<{
  /** 校验通过后交给调用方处理；不代表已持久化。 */ confirm: [value: Model];
}>();
async function confirm() {
  const result = await form.value?.validate();
  if (!result?.valid) return;
  emit("confirm", { title: model.value.title.trim(), quantity: model.value.quantity });
}
</script>

<template>
  <!-- 模型由本组件持有；MyForm 通过 v-model 更新，不负责保存。 -->
  <MyForm
    ref="form"
    v-model="model"
    :fields="fields"
    :context="undefined"
    :create-initial-model="initial"
    mode="add"
  />
  <el-button @click="confirm">确认资料</el-button>
  <!-- 同一模型的只读预览；不要为预览再创建一个编辑控制器。 -->
  <MyDesc :model-value="model" :fields="fields" :context="undefined" />
</template>
```

读取另一条记录时使用 MyForm 的公开 hydrate 或明确的 formKey，不用普通字段 patch 模拟换实体。
需要草稿、权限、主子表和保存后导航时，回到标准 useCrudView，避免逐个补写相同流程。

### 独立表格：最小只读用法

下面同样是完整局部组件示例；rows 是本地演示数据，不会自动请求接口或保存。

```vue
<script setup lang="ts">
import MyTable from "@/components/table/MyTable.vue";
import { defineFields } from "@/components/business/fields/normalize";
interface Row {
  /** 稳定数字行键；0 有效，不使用数组下标。 */ id: number;
  /** 表格显示名称。 */ name: string;
}
const rows: Row[] = [{ id: 0, name: "示例资料" }];
const fields = defineFields<Row, undefined>()([
  { key: "name", label: "名称", type: "text", table: { minWidth: 180 } },
]);
const getRowKey = (row: Readonly<Row>) => row.id;
</script>

<template>
  <!-- rows 由调用方提供；未配置 edit，不建立可编辑行草稿。 -->
  <MyTable
    :rows="rows"
    :fields="fields"
    :context="undefined"
    :get-row-key="getRowKey"
    height="auto"
  />
</template>
```

增加分页、选择或编辑时，按 [MyTable 与整单保存](#mytable-与整单保存) 的事件参数说明接入。
不要监听同一个动作后再调用两次请求；不通过私有表格 ref 操作行数据。

### 标准 CRUD 的拆分用法

页面只调用一次 useCrudView。完整外壳和拆分组件二选一：

```vue
<!-- 以下仅为模板片段；setup 已取得同一个 useCrudView 的 state/actions/bindings。 -->
<MyCrudLayout>
  <template #toolbar><MyCrudFormToolbar v-bind="bindings.toolbar" /></template>
  <!-- 草稿提示和失败重试仍使用原控制器；省略此组件时由页面自行提供提示。 -->
  <MyCrudFormFeedback v-bind="bindings.feedback" />
  <!-- 加载只隐藏，不反复卸载已登记的字段与子表操作接口。 -->
  <div v-show="state.phase !== 'loading'">
    <MyCrudFormFields v-bind="bindings.fields" />
    <!-- 主子表模块在这里显式放入所有必需子组件，并传 bindings.child(key)。 -->
  </div>
</MyCrudLayout>
```

这段省略了页面初始化错误、加载提示和子表，不作为完整生产页面复制。
完整可运行接法、详情拆分与字段插槽见 [CRUD 定制布局](./crud-development-guide.md#定制布局按需组合相同的表单能力)。
跨模块页面容器也必须有明确所有者：完整 MyCrud 容器自动挂载；纯定制页面如需打开弹窗/抽屉，
应从原绑定取得 host 并挂载一次 MyBusinessPageHost，不在父子组件重复挂载。
Ctrl/Command+S 的键盘监听属于完整 MyCrudForm 外壳；单独摆放 Toolbar 不会自动建立快捷键作用域。

### 模板区块注释怎么写

让第一次打开文件的开发者先知道“这一块做什么、传什么、会显示什么”。只有替换它会影响保存、校验等行为时，再补充注意事项。props/事件的详细参数仍写在声明处，不把整张 API 表复制到模板中。

```vue
<!-- 显示并编辑联系人。contacts 来自 bindings.child('contacts')，修改后会随客户一起保存。 -->
<CustomerContacts :binding="contacts" />
```

不为每个 div 写“容器”之类的注释，不把长篇 Markdown 塞进 HTML 注释，也不在运行界面显示开发说明。
组件新增/修改时同步所属用法章节与关键区块说明；检查示例是否是完整代码，片段必须标明前置上下文。
统一写法和正反例见 [注释先回答使用问题](./typescript-and-structure.md#注释先回答使用问题)。

## 单独使用一个字段

`FieldInput` 根据字段的 `type` 显示输入控件，`FieldDisplay` 根据同一份配置显示文本、金额、日期、图片等内容。它们不要求创建 CRUD 模块，也不要求传完整页面的数据。

| 组件           | 必传参数                          | 使用后得到什么                                                       |
| -------------- | --------------------------------- | -------------------------------------------------------------------- |
| `FieldInput`   | `field`、`env`、`readonly`        | 一个输入控件；通过 `change` 通知新值，通过 `commit` 通知本次交互完成 |
| `FieldDisplay` | `field`、`env`                    | 一个只读值；空值显示 `—`，按字段类型格式化，可选 `scene="table"`     |
| `MyFormField`  | `MyForm` 提供的 `field(key)` 结果 | 带标签、必填提示和校验错误的表单项；不适合自己拼参数独立使用         |

普通文本的 field 只需 `key/label/type`。`form`、`detail`、`table` 都不是直接调用这两个渲染组件的必填项；选择框仍需 `options`，字典需 `dict`，参照需 `reference`。`MyForm/MyDesc` 会按 `form/detail` 决定是否显示字段，与直接调用渲染组件不同。

### 输入并同时显示结果

下面是完整例子：输入姓名后，下方立即显示新值。`env.model` 只含这个字段；没有组织等额外信息时，`context` 传 `undefined`。

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import FieldInput from "@/components/business/fields/FieldInput.vue";
import FieldDisplay from "@/components/business/fields/FieldDisplay.vue";
import type { FieldDefinition, FieldEnvironment } from "@/components/business/fields/types";

interface Model {
  name: string;
}
const model = ref<Model>({ name: "" });
const nameField: FieldDefinition<Model> = {
  key: "name",
  label: "姓名",
  type: "text",
  props: { maxlength: 40 },
};
const env = computed<FieldEnvironment<Model, undefined>>(() => ({
  model: model.value,
  context: undefined,
  mode: "add",
}));
function onNameChange(value: string, mapped: Partial<Model>) {
  model.value = { ...model.value, ...mapped, name: value };
}
</script>

<template>
  <FieldInput :field="nameField" :env="env" :readonly="false" @change="onNameChange" />
  <p>
    当前姓名：
    <FieldDisplay :field="nameField" :env="env" />
  </p>
</template>
```

`FieldInput` 当前没有 `v-model`，页面通过 `change(value, mapped, reason)` 回写：value 是当前字段的新值，mapped 是参照或地区选择额外回填的字段，reason 说明是用户输入还是关联条件变化。上例只有一个字符串字段，不能直接当作任意多字段表单的回写函数。

直接使用时，组件只负责输入或显示，不会自动执行 `form.required/rules/visible/readonly`、整张表单的 `links` 或保存逻辑。需要这些能力时使用 [MyForm](#独立表单与详情完整最小例子)。`readonly` 要显式传入；`type: "custom"` 的自定义输入需在表单插槽中实现。

`FieldDisplay` 默认按详情格式显示；`scene="table"` 改用 `table.format`，详情使用 `detail.format`。目前 env 的 mode 只允许 `add/edit`，纯详情可传 `edit`，它本身不会让组件变成输入框。这里记录的是现有接口，尚无只传 `value + field` 的统一简化入口。

## 业务 source 与独立参照

`MyReference` 用于选择客户、销售组织、商品等业务记录：传入 ID 和数据源，即可搜索候选、打开选择弹窗，并在编辑时按 ID 显示名称。它可直接使用 `v-model`，不需要 `FieldInput`、`MyForm` 或 CRUD 页面。

### 单独选择销售组织

下面是完整组件。复用已有的销售组织数据源，父页面传入当前组织和范围标识；用户选择后，saleId 保存 ID，saleName 保存名称。清空时名称也会清除。

```vue
<script setup lang="ts">
import { ref } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import { saleReference } from "@/pages/base/sale/references";
import type { SaleRecord } from "@/api/base/sale/types";
import type { ReferenceCommit } from "@/components/business/MyReference/types";

defineProps<{
  /** 当前组织 ID，与业务接口使用同一个值。 */
  organizationId: string;
  /** 由登录用户、组织及权限版本组成的稳定标识，不传 Token。 */
  scopeKey: string;
}>();
const saleId = ref<string | null>(null);
const saleName = ref("");
function onSaleCommit(event: ReferenceCommit<SaleRecord, string, false>) {
  saleName.value = event.items[0]?.name ?? "";
}
</script>

<template>
  <MyReference
    v-model="saleId"
    :source="saleReference"
    :filters="{ organizationId }"
    :scope-key="scopeKey"
    placeholder="请选择销售组织"
    @commit="onSaleCommit"
  />
  <p>已选名称：{{ saleName || "未选择" }}</p>
</template>
```

| 参数/事件  | 应该传什么                                      | 可以省略吗                            |
| ---------- | ----------------------------------------------- | ------------------------------------- |
| `v-model`  | 单选为原类型 ID 或 `null`；多选为 ID 数组       | 必传当前值；只读时可用 `:model-value` |
| `source`   | 现有业务数据源，例如 saleReference              | 必传，但可在不同页面复用              |
| `filters`  | 数据源要求的查询范围，例如 `{ organizationId }` | 必传，内容由数据源类型决定            |
| `scopeKey` | 当前用户、组织和权限版本对应的稳定标识          | 必传；身份或权限改变时更新            |
| `commit`   | 需要额外回填名称等字段时监听                    | 只需要 ID 时可省略                    |
| `multiple` | `true` 开启多选，同时将值改为数组               | 默认单选，不在运行时切换              |
| `readonly` | `true` 只显示已选内容                           | 默认允许选择                          |

### 参照弹窗的布局与选择操作

参照弹窗仅保留查询区、候选列表和底部工具栏。分页与取消、确认放在同一行，候选列表与已选清单各自滚动。选择记录不会改变表格高度；仅调整窗口尺寸时重新分配高度。错误及单选跨页后的已选名称在工具栏上方浮出，不额外占一行。窄屏自动全屏，分页仅显示前后翻页和当前页数，多选清单可展开查看。

- 单选：单击暂选，双击确认当前行；也可点击“确认选择”。传入 `:confirm-on-double-click="false"` 可关闭双击确认。
- 多选：单击或勾选增减，双击保持该行选中且不关闭；翻页和查询保留暂选集合，取消不回写原字段。
- 列表区域获得焦点后，上下键移动高亮行；单选 Enter 确认，多选 Space 勾选。查询框 Enter 仍然查询，Esc 取消弹窗。
- 所有确认方式都复用记录有效性检查和 `beforeCommit`；查询或提交期间禁止快速确认，失败提示在底部显示，暂选保留。

普通业务弹窗默认仍由正文滚动。如果内容需要固定分页等区域，可使用 `<MyDialog fill-height body-scroll="content">`，由内容通过 flex/grid 分配剩余高度并管理内部滚动；不要覆盖 Element Plus 私有样式。

### 单独显示已选参照

沿用上例的导入、saleId 和父页面参数，替换为以下模板即可按 ID 显示只读内容：

```vue
<MyReference
  :model-value="saleId"
  :source="saleReference"
  :filters="{ organizationId }"
  :scope-key="scopeKey"
  readonly
/>
```

无需为了回显名称再写一个查询。初始 ID 的解析通过 `resolve` 事件通知，**不会触发上例的 commit 名称回填**；上例 saleName 只代表本次选择后回填的名称。组件自己仍会显示已有 ID 的名称。不要在 resolve 中修改其他业务字段，避免加载详情时覆盖表单数据。

如果详情需要纯文本或名称链接，可复用 `createReferenceField` 创建的字段，再交给 `FieldDisplay` 显示；仍需提供 field 和 env。只读参照会根据 ID 查询当前记录，不等同于直接展示接口返回的历史名称。

### 新参照的数据源写在哪里

已有参照直接导入即可；只有新增一种业务参照时才定义数据源。参考 [销售组织数据源](../src/pages/base/sale/references.ts)，在业务模块的 references.ts 中集中写一次：

| 配置              | 用途                                                     |
| ----------------- | -------------------------------------------------------- |
| `key/title`       | 稳定的参照名称和选择弹窗标题                             |
| `getKey/getLabel` | 从记录读取 ID 和显示名称                                 |
| `columns`         | 弹窗中要显示的列                                         |
| `search`          | 根据关键词、固定条件和页码搜索，返回 `{ list, total }`   |
| `resolve`         | 按 ID 批量读取已选记录，返回 `{ items, unavailableIds }` |
| `selectable`      | 可选；例如停用的组织可以显示但不允许选择                 |

同一个 source 可用于 MyReference 和 createReferenceField。后者把参照接入统一字段配置，在 `filters/scopeKey` 中读取页面数据，在 `map` 中返回名称等回填字段；主 ID 仍由字段处理。只使用选择器时无需绕一层字段工厂。

### 回填、校验与请求处理

新业务先在 API 模块声明 DTO 和请求，再在业务模块创建不可变 `ReferenceSource<Row, Id, Filters>`。复用项目 request 实例，其普通响应已经解包。source 的 search 接收 keyword、filters、conditions、pageNum/pageSize、purpose；返回 `{ list, total }`。resolve 批量接收 ID，返回 `{ items, unavailableIds }`，每个请求 ID 必须且仅能归入一处。系统错误 reject，不能当成记录缺失。把 context.signal 传给请求，采用 `errorPresentation: "local"` 避免重复消息。

可运行的三个 source 在 `src/pages/component-lab/reference/references.ts`；接口适配位于 `src/api/reference-lab/`。这些是开发数据示例，正式页面必须使用自己的 API，不引入实验模块。接口协议未知时先完成后端接口约定，不能扫描第一页猜测 ID 是否存在。

以下片段在开发实验页中复用现有 source，客户 ID 为 number，商品 ID 为 string：

```vue
<script setup lang="ts">
import { ref } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import { customerSource, productSource } from "@/pages/component-lab/reference/references";
const customerId = ref<number | null>(null);
const productIds = ref<string[]>([]);
const filters = { organizationId: "org-a" as const };
const scopeKey = "demo:user-a:org-a:permission-v1";
</script>

<template>
  <MyReference
    v-model="customerId"
    :source="customerSource"
    :filters="filters"
    :scope-key="scopeKey"
  />
  <MyReference
    v-model="productIds"
    multiple
    :source="productSource"
    :filters="filters"
    :scope-key="scopeKey"
    :max-selected="50"
  />
</template>
```

单选空值为 null，多选空值为 []；0 有效，数字和字符串 ID 不混同。multiple 不在运行时切换。filters 是可序列化固定条件，scopeKey 隔离用户、组织与权限版本，不使用 Token 字符串。普通 filters 变化保留值但重新验证；scope/source 变化强制隔离旧选择。真实应用必须在身份/权限变化时更新 scopeKey 或卸载组件，不能照抄实验页固定 scope。

候选默认 debounceMs=250、minChars=1、suggestLimit=8（运行时限制 1—100）。多选候选立即增减，弹窗跨页仅改变草稿，确定才提交；表头全选只针对当前页可选行。beforeOpen/beforeCommit 返回 `{ allowed, reason? }`，异步守卫受会话版本保护。

业务回填只监听 `commit`，不要从 `resolve` 回填其他字段；commit 的 items 是完整新集合，含 previousValue、addedIds、removedIds、reason。`update:modelValue` 在 commit 前同步触发。`resolve` 仅用于回显状态；error 为局部错误通知，open-change 为弹窗状态。清空也走守卫，同值不重复提交。

公开 ref 类型为 `ReferenceExpose`：open、close、focus、clear、reload、validateSelection。保存前 await validateSelection，检查 allowed；不要将“名称显示成功”当成有效性证明。source 列、条件与 resolve 完整性有运行时检查，泛型错误模型在编译期拒绝。

### 参照查看与前往新增

`MyReference` 与 `createReferenceField` 都接受可选 `navigation`，不配置则沿用普通参照。
独立参照的 `ReferenceNavigation<Row, Id>` 与 source 分开声明：

```ts
const navigation: ReferenceNavigation<CustomerRecord, string> = {
  view: (id, row) => ({ target: "customer", id }),
  create: "customer",
  createLabel: "前往新增客户",
};
```

目标在 `src/router/business-targets.ts` 显式登记，登记提供轻量页面声明，不授予菜单、读取或新增权限。
`view(id, row)` 接收原始类型 ID 和已解析记录，返回目标请求；有 id 且目标支持 detail 时进入详情，
否则进入列表。`create` 是目标 key，按目标 `page.presentation` 直接打开新增页面、弹窗或抽屉；不自动保存。
`createLabel` 省略时使用“前往新增”。单选右侧、多选各标签及字段只读展示均有查看入口；
只读禁用修改但仍允许查看。解析失败保留原 ID、展示局部错误与重试，不编造名称或导航。
已解析但不可重新选择的历史记录仍可展示/查看，保存校验仍检查 selectable。

查询成功为空时中性提示“当前范围没有匹配记录，请调整搜索条件”，先引导调整/重置搜索，并保留配置过的新增入口。
不把空列表推断为“没有单据”或“没有权限”；请求失败继续显示错误，不伪装为空状态。
`QueryPanel.focus()` 是公共焦点入口，不访问 Element Plus 私有 DOM。
跳转失败显示局部轻提示。参照页 KeepAlive 停用时隐藏浮层，返回时恢复原搜索和待确认选择；
未启用 KeepAlive 的来源仅依赖原有草稿机制，不新增跨页表单存储，不承诺恢复未保存内容。
默认返回不自动选择；配置 `createdId: (id) => id` 后，通过原 source.resolve、可选性和 beforeCommit 校验选入新记录。数值 ID 应在此显式转换并校验；返回 null 放弃回写。来源已卸载、范围或选择已变化时不覆盖。
展示配置、返回通道和容器层数见 [CRUD 统一展示](./crud-development-guide.md#新增编辑详情的统一展示与跨模块打开)。

声明 source.query 的参照使用与列表相同的紧凑查询栏：输入框内搜索，“筛选”展开普通/高级查询和重置；
配置过的前往新增入口使用右侧带跳转图标的描边按钮。Sale 和实验页客户参照复用所属模块的派生 schema。
旧 source 仅提供 keyword/conditions 时继续兼容旧搜索，不凭空宣称后端支持高级 AST。
多选参照按实际弹窗内容宽度布局：宽容器固定左右区域同高，已选项只在右栏内部滚动；窄容器（包括桌面上的窄抽屉/弹窗）纵向排列并限制已选区高度。表单字段、紧凑查询栏和普通查询弹窗也按各自所在容器宽度收为单列；组件不注册全局 resize 监听，表格仍复用 `TableView` 既有的 `ResizeObserver` 测量。

### 页面局部回写覆盖

共享参照可放业务模块 `references.ts`，主字段注册仍在 `config.ts` 内联。
`reference.withMap(callback)` 创建新实例，仅替换 map，不修改共享对象，不替换 source、filters、守卫或导航。
在 `add.vue/edit.vue` 的 `useCrudView` 选项传入：

```ts
form: {
  references: {
    provinceId: customerReferences.province.withMap(({ items }) => ({
      provinceName: items[0]?.name.trim() ?? "",
    })),
  },
}
```

回调接收 typed commit 与字段 env，必须同步返回 `Partial<Model>`；不要自行发请求或直接修改模型。
选择/清空仍依次执行主 ID + map patch、原有 links、一次 hooks.change。map 不得以不同值覆盖当前参照主 ID；
清空时 items 为 []，业务需返回关联字段空值。覆盖会验证字段存在且 type 为 reference；
非法 key 不会静默忽略。不配置覆盖则保持原 fields 引用，不做全量深拷贝。
完整例子见 `src/pages/base/customer/references.ts` 和 `edit.vue`。

## 字段、表单、查询与详情

字段归组件旁 `fields/types.ts`，通过 `defineFields<Model, Context>()([...])` 定义。需要哪个场景就显式声明 form、detail、table；不声明的场景不自动出现。字典 valueType 与模型类型相符，数字清空若需 null 须声明 emptyValue。公共字段不直接拼保存 DTO。

文本使用 `text`，长文本使用 `textarea`。紧凑表格默认单行省略；内容被裁切时悬浮单元格显示完整值，长文本或需要换行的子表显式使用现有舒适/换行显示，不在页面重复实现省略和 tooltip。金额使用 `amount`：模型、DTO 和计算均为十进制字符串，字段层校验非负值、精度（默认两位）、上下界，不接受千分位或科学计数法；展示才调用 `decimal.ts` 的 `formatMoney`。日期支持 `date`、`month`、`year`、`datetime` 和 `dateRange`，分别按 `YYYY-MM-DD`、`YYYY-MM`、`YYYY`、`YYYY-MM-DD HH:mm:ss` 与两端日期字符串提交；区间要求完整且不允许逆序。`dateRange` 默认清空为 `[]`，页面模型用 `null` 表示空值时显式声明 `emptyValue: null`。

省市区使用 `region` 字段，不把三个独立选择框拼在业务页。字段值是最后一级 ID，`region.map(items)` 显式原子回写省、市、区的 ID 和名称等业务字段；`RegionCascaderSource.loadChildren(parentId, level, filters)` 支持逐级接口，`resolvePath` 用于编辑回显的路径接口。服务申请是当前可运行例子。固定组织/租户等条件放 `filters`，不要把用户选择的 parentId 混入固定范围；真实后端可以改为整树或路径接口，只替换所属 API source。

地区候选加载失败和路径回显失败分别显示局部错误与重试入口；根级成功返回空数组时显示当前范围暂无可选地区。回显失败保留原始字段值，不发出清空回写。候选请求成功不能消除尚未恢复的路径错误；切换范围、取消和卸载后的迟到响应不能覆盖当前状态。

```ts
import { defineFields } from "@/components/business/fields/normalize";
interface Model {
  title: string;
  quantity: number;
}
interface Context {
  canEdit: boolean;
}
const fields = defineFields<Model, Context>()([
  {
    key: "title",
    label: "标题",
    type: "text",
    form: { required: true, readonly: ({ context }) => !context.canEdit },
    detail: true,
    table: { minWidth: 160 },
  },
  {
    key: "quantity",
    label: "数量",
    type: "number",
    form: { required: true },
    detail: true,
    table: {},
    props: { min: 0 },
  },
]);
const createInitialModel = (): Model => ({ title: "", quantity: 0 });
```

把 fields、context、createInitialModel 与 v-model 传给 MyForm，显式提供 mode="add" 或 "edit"。MyDesc 接收相同 fields、context、model-value，按 detail 展示。MyForm 方法类型为 `MyFormExpose<Model>`，实体加载用 hydrate(model)，恢复用 reset()；applyPatch(patch, reason) 用于普通变更，不能替代实体 hydrate。validate/validateFields 返回 `{ valid, stale?, errors }`，页面只有 valid 才提交。clearValidate 与 focusField 用于清理、定位错误。如果外层已经校验过当前模型，可调用 `setErrors(result.errors)` 展示结果，避免重复执行异步规则；它只展示当前可见字段的错误，传空数组会清空提示。调用方需要先排除过期结果，模型发生变化后应重新校验。

隐藏字段保留值但不参与可见表单校验；只读与必填依据当前模式/context 展开。后端仍须鉴权。快照支持普通对象、数组、Date 与原始值，禁止函数、组件实例或循环结构。自定义字段插槽使用 setValue，避免直接修改父模型。

参照字段用 `createReferenceField<Model, Context>()({ source, filters, scopeKey, map })`，map 从 typed commit 返回 Partial<Model>；无需复制 MyReference 的回显或请求代码。客户变化清联系人等业务规则写在页面 fields.ts 的 `FieldLink`：显式 watch/writes/clear/apply。apply 为同步纯函数，环路、未声明写入、冲突会报错。hydrate/reset 不执行依赖清空。

MySearch 的 Query 独立于编辑 Model，用 `buildSearchFields<Query, Context>()` 定义，search.operator 只支持 eq/contains/in/between；between 对应 dateRange。传 fields、context、createInitialQuery，监听 submit/reset；普通输入不请求。高级条件折叠保留已填值。页面将一次事件转换为一次 API 请求，保留 0/false，完整日期范围再转换起止参数。

实际完整实例：`src/pages/component-lab/form/fields.ts`、`adapters.ts`、`index.vue`。第二个不同模型已在 `src/pages/component-lab/table/fields.ts` 和主表 MyForm 中复用，同 source 与字段工厂无实现复制。

### 富文本字段

富文本单独使用 `type: "rich"`，模型为 HTML 字符串（string 或 string | null），
不混用 textarea 的 rows。接口约定见 [RichTextProps](../src/components/business/fields/rich-text.ts)。

```ts
{
  key: "description", // 模型中显式声明 HTML 字符串字段
  label: "详细说明",
  type: "rich",
  form: { required: true, span: 3 },
  detail: true,
  props: { height: "320px", placeholder: "请输入说明", maxlength: 2000, readonlyDisplay: "html" },
}
```

| 配置            | 类型            | 默认值与效果                                         |
| --------------- | --------------- | ---------------------------------------------------- |
| height          | string          | 240px，编辑内容区 CSS 高度，不含工具栏               |
| placeholder     | string          | “请输入内容”，字段顶层 placeholder 优先              |
| maxlength       | number          | 正整数，省略不限；可见文本 UTF-16 长度，不含标签     |
| readonlyDisplay | "text" / "html" | 默认 text；html 展示清理后的基础排版，列表始终纯文本 |

编辑器仅在可编辑 rich 字段使用时加载，等待时保留空间；失败可重试且不清空模型。
图片上传复用 FileAPI，卸载取消请求并阻止迟到插入。
只读不加载编辑器；HTML 展示使用 [DOMPurify](https://github.com/cure53/DOMPurify)
限定标签/属性清理，移除脚本、事件、内联样式、iframe 等。
清理不改原 DTO，后端存储及其他终端展示仍需独立校验。

必填根据内容判断，`<p><br></p>`、空白、零宽占位不算填写；
有效图片算内容，maxlength 只限制文本。
自定义插槽也不能直接将未经清理的 HTML 交给 v-html。

### 上传与下载

字段 `image/images/files` 继续复用 `common/Upload` 的单图、多图和附件组件。
公开 props 在 [Upload/types.ts](../src/components/common/Upload/types.ts)：`name` 默认 `file`，
`data` 接受字符串、数字、布尔值或 Blob；数字和布尔值按字符串加入 FormData。
`maxFileSize` 默认 10 MiB；附件 `accept` 默认 `*`，图片默认 `image/*`，扩展名不区分大小写。
这些检查只针对文件元信息，文件内容、Excel 解析和业务校验仍由后端负责。

附件模型是文件 API 的 `FileInfo[]`，图片模型分别是 URL 字符串和 URL 数组。
多文件逐个成功回写，不等待整批结束；失败不抹去已成功结果，也不重建其他在途文件。
外部替换模型或卸载组件会取消旧请求并拒绝迟到结果；取消不代表后端撤回已上传文件。
多图和附件删除沿用当前 FileAPI，失败保留记录；单图删除仍只清空当前字段。
上传进度只表示已发送字节，100% 不表示服务端处理完成。

下载复用 [downloadFile](../src/utils/download.ts)，接收带响应头的 Blob/ArrayBuffer 响应。
优先使用传入文件名，否则读取 Content-Disposition；畸形编码会回退，点击失败仍清理对象 URL。
文件请求继续使用现有 API 与认证方式，尚未约定正式后端的文件 ID、存储或签名 URL。

### 附件预览与图片字段

`files` 字段仍显示文件名列表：点击名称预览，上传列表保留独立下载、删除按钮。
上传区和只读字段复用附件条目，按文件扩展名显示 SVG 图标、分类配色和格式说明；
长文件名自动换行，未知类型使用通用图标。类型提示不代表该格式一定支持在线预览。
只读附件也可预览；图片和文档统一使用 `open-file-viewer`，弹窗提供原文件下载，
并按附件原顺序通过“上一个附件 / 下一个附件”切换，保持相同的渲染容器和操作入口。
预览用的 Excel 解析只用于显示，不承担业务导入、校验或执行。

独立入口是 [FilePreviewDialog](../src/components/common/FilePreview/FilePreviewDialog.vue)，
公开参数见 [types.ts](../src/components/common/FilePreview/types.ts)：

```vue
<FilePreviewDialog v-model="previewVisible" :files="attachments" :initial-index="0" />
```

服务端附件直接传现有 `FileInfo[]`；本地文件可传 `{ name: file.name, blob: file }`，
只在内存试阅，不上传、不进入业务 DTO。关闭、切换文件和页面失活时释放预览资源。
需要内嵌文档时使用 [FilePreview](../src/components/common/FilePreview/FilePreview.vue)，传 Blob 和原文件名。

`image` 保留单图展示，`images` 保留缩略图及成组浏览，不切换成附件文件名列表。
TODO(image-customization)：单图上传前的头像裁剪、固定比例、压缩，以及多图排序、逐张裁剪
和批量处理待业务定制；裁剪取消应保留原图片。当前只有最简上传和图片预览。

远程预览与下载复用 `FileAPI.read`：站内和配置的 API 域沿用认证，外域匿名读取且需要 CORS。
只接受 HTTP(S) 和站内绝对路径，不向任意附件域名发送登录 Token。
文件名用于格式识别，签名 URL 无扩展名时也必须保留原始名称。解析失败显示提示并允许下载；
不代表所有复杂 Office 文档都能保真显示，不自动调用外部转换服务。

文档模块按打开动作加载。PDF worker、字体和解码资源均本地部署；`pnpm dev/build`
运行 `scripts/prepare-file-preview.mjs` 生成被 Git 忽略的资源目录，子目录部署使用 Vite base。
当前上游仍引入较多格式依赖，异步加载不等于安装包体积小。

开发验证入口为 `/#/component-lab/form` 的“附件预览实验”，也可在销售组织的“组织附件”上传后验证。
上传 Mock 保留原文件名和原始字节，仅在开发服务内存中保存；重启服务或热更新文件 Mock 后需重新上传。
每个文件最多 20 MB，内存总量最多 200 MB；旧种子附件地址没有真实内容时返回 404。

## Word 合同编辑试用

开发地址为 `/#/component-lab/word-editor`，登录后访问。页面使用 EigenPal，
导入文档后按需加载编辑器。
支持本地 DOCX（非空、最多 10 MB）导入、基础编辑、普通文本变量插入、导出及预览上次导出。
预览复用 `FilePreviewDialog` 和 open-file-viewer，轻提示复用 `feedback`，页内状态复用
`MyFeedback`。没有上传、自动保存或后端模板替换；刷新、离开和替换文件时对未导出修改提供提醒。

公共组件在 `src/components/common/WordEditor/`，接口在同目录 `types.ts`：

- `document` 传已读取的 ArrayBuffer，`name` 传原始 DOCX 文件名；替换文档时用新 `key`
  重建组件，取消旧实例的生命周期。不要通过修改上游私有对象更新文档。
- 收到 `ready` 后调用公开 `insertVariable('[[甲方名称]]')`、`exportDocx('合同.docx')`。
  `change` 仅通知内容改变，不在每次输入时序列化整个 DOCX；错误由宿主处理一次。
- `exportDocx` 返回 `{ blob, downloadStarted }`。EigenPal 返回的 `downloadStarted` 为 false，
  由宿主调用公共下载工具，并保存 Blob 供预览。
- 引擎特有选区、格式命令与事件留在适配组件，业务页面不依赖这些内部数据格式。

当前只使用 EigenPal 的免费 Vue/Core/i18n/fonts 包。
Core 使用仓库内固定布局表格修复包，来源、构建和升级方式见 [本地修复依赖](../vendor/README.md)。
EigenPal 工具栏采用官方组件，不能据此宣称无损往返复杂 Word。
EigenPal 的上游工具栏在开发模式可能产生非函数 slot 警告；不通过屏蔽全局警告隐藏它。

西文字体按锁定依赖版本准备到 public，并携带许可证；地址由
`src/config/document-assets.ts` 统一管理。中文目前依赖本机字体，缺失字体、字体替代和不同
编辑器的布局算法均可能改变分页。TODO：确认可分发中文字体后添加共享字族清单、按需加载和
真实合同的排版验证。部署和缓存约定位于[构建与部署](../README.md#构建与部署)。

变量当前是普通文本，例如 `[[甲方盖章]]` 不代表已经实现电子签章。后端替换需跨 Word 文本
片段识别占位符；图片、金额、日期等变量类型、重复变量及缺失值规则待后端协议确定。
评估真实模板时应比较原 DOCX、编辑后 DOCX、平台预览，并在桌面 Word 核对表格、分页、
页眉页脚和图片；平台预览结果不能单独证明 Word 保真度。

## 高德与腾讯地图接入

开发试用入口：`/#/component-lab/maps`，沿用登录守卫，仅开发环境注册，不加入正式业务菜单。
组件入口为 `src/components/common/MapViewer/MapViewer.vue`，配置入口为 `src/config/maps.ts`。

将根目录 `.env.maps.example` 的两项数组配置复制到未提交的 `.env.development.local`，
填写后重启 `pnpm dev`。高德使用 Web JS Key，并配套 `securityJsCode` 或安全代理
`serviceHost`；腾讯使用 Web JS Key，搜索还需开启 WebService API 权限。
腾讯若启用 WebService 签名校验，应后续通过服务端代理接入，不向浏览器下发签名私钥。
需要在厂商控制台配置当前域名白名单。
每个数组可以放多项 `{ "key": "..." }`；高德每项携带自身安全配置。
配置会进入浏览器，不能放服务端私钥，真实凭证不要提交到 Git。

```vue
<MapViewer :provider="provider" :credentials="credentials" @region="onRegion" />
```

`provider` 为 `amap` 或 `tencent`，`credentials` 类型为 `readonly MapCredential[]`。
`point` 返回厂商和点击坐标；`region` 返回 `MapRegion` 草稿副本：

- `provider`、`coordinateSystem: "GCJ-02"` 保留来源与坐标系。
- `geometry.kind` 为 `polygon/rectangle/square/circle/multipolygon`；前三种使用 `points`，
  圆形使用 `center` 和以米为单位的 `radius`；`multipolygon` 使用 `polygons`，
  每片为 `[外环, 内环…]`。环不重复末尾闭合点，不把圆离散成多边形。
- `source` 区分 `manual`（手绘）、`estimate`（尺寸估算）、`boundary`（候选数据原始轮廓）。
- `boundary` 保留来源候选、原始几何、标识及链接；应用编辑后 `modified: true`，
  几何变化写入 `geometry`，不改写来源轮廓。
- 自动生成时携带 `place`（含可选厂商 POI ID），手绘不携带。

两家都使用 GCJ-02；切换厂商会清空组件草稿，不做隐式坐标转换。
搜索城市默认北京市，可在工具栏修改；城市空白时回退北京市。
业务调用方需要自行清理已接收的旧结果，示例页已有演示。

### 公司档案与位置选择器

业务入口为“基础资料 → 公司档案”（`/#/base/company`）。维护编码、名称、联系人、电话、
启用状态、备注和一个位置；新增、编辑沿用标准 MyCRUD 标签页，详情只读查看地图。
API 位于 `src/api/base/company/`，目前由 `mock/company.mock.ts` 提供开发进程内数据，
重启会恢复种子记录；正式组织权限、数据库持久化和打卡规则尚未接入。

可复用组件为 `src/components/common/MapViewer/MapLocationPicker.vue`，在公司档案和地图试用页使用。
它组合已有 `MyDialog`、`MapViewer`、Element Plus 和 `MyFeedback`；不增加新的 CRUD 字段类型。

```vue
<!-- config.fields 将 location 声明为 type: "custom"，默认值 null。 -->
<MyCrudForm v-bind="bindings.form">
  <template #field-location="{ value, update, commit, readonly }">
    <MapLocationPicker
      :model-value="value"
      :readonly="readonly"
      @update:model-value="value => { update(value); commit(); }"
    />
  </template>
</MyCrudForm>
```

- `modelValue` 为 `MapLocation | null`，接收只读模型；点位必选，`region` 可省略。
  位置包含 `provider / coordinateSystem / place`，区域保留原生形态与来源信息。
- 默认只显示名称、地址、坐标、厂商与区域摘要。打开弹窗才创建 SDK；取消、关闭和切离缓存页
  不回填临时选址，关闭即销毁地图。“使用此位置”回填字段；公司表单保存才提交整条档案。
- 搜索支持任意关键词，也可单击地图选点后填写位置名称和详细地址。搜索失败保留已选位置。
  明确选择新地点会清空旧区域；已有区域时先点“重新选点”再单击地图，
  避免绘制完成的鼠标事件或查看地图时误改点位。绘制、编辑、搜索和边界查询未完成时不能提交。
- 地图与任务面板固定分栏，地点搜索、位置确认、范围设置各自切换；只允许搜索候选列表滚动，
  常用操作不依赖弹窗正文滚动。窄屏在地图和操作面板间切换。生成区域后展示结果，重新设置才展开工具。
- `readonly` 只提供查看，不提供搜索、编辑或回填；详情用公开 `tab-location` 插槽组合。
- 新位置默认厂商读取 `VITE_MAP_PROVIDER=amap|tencent`，省略为高德，也可用 `provider` prop 覆盖。
  已存位置使用其原厂商回显；部署若移除该厂商凭证，需要先明确迁移策略，不暗中丢失原位置。
- `loadPlaceBoundary` 可替换默认 OSM 加载器，接入已授权的厂商或自建数据服务；契约见下文。
  凭证读取 `src/config/maps.ts`；只启用一家地图时只填写相应数组即可。
- 底层 `MapViewer` 的 `mode` 默认为 `editor`（完整试用工具），`picker` 提供任务分栏选址，
  `view` 只读。`initialLocation` 仅用于挂载初始化，换实体须重新挂载；`selection` 返回临时副本，
  `busy` 用于禁用提交。`MapLocationPicker` 已负责这些生命周期，不需要访问 SDK 或私有 ref。

弹窗设计约束：普通配置弹窗应让当前任务的必要输入、已选结果和确认/取消在一屏内可见。
内容过多时优先拆分任务状态、切换面板或转为独立页面，不通过让整个弹窗滚动来容纳控件。
搜索候选列表、Word 正文等内容本身可局部滚动；工具栏和确认区必须固定可达。

### 公司合同模板字段

公司档案的 `contractTemplate` 为 `FileInfo | null`，通过 `type: "custom"` 与 `field-contractTemplate`
插槽接入 `WordTemplateField`，继续使用字段 `update/commit`、CRUD 保存、版本与草稿。

- 表单点击“导入 Word 模板 / 编辑 Word 模板”，在独立大窗口中使用已有 EigenPal 编辑器。
  导入限制为非空 DOCX、10 MB；提供常用变量、自定义变量、当前内容预览和 DOCX 导出。
- “应用到公司档案”导出并通过现有 `FileAPI` 上传新版本，再回填 `{name,url}`；
  不覆盖旧文件。随后保存公司档案才建立关联；取消编辑不会改写主表，未应用修改有离开确认。
- 详情仅通过已有 open-file-viewer 预览和下载，不加载可编辑 Word 实例。
- 本机 CRUD 草稿只存文件引用，不保存 DOCX 字节。当前文件和档案都是开发 Mock，
  重启服务后附件可能失效；正式文件保留策略、孤立上传清理、变量替换及电子签章尚未实现。
- Word 工具栏和应用按钮固定显示，正文按文档长度滚动，不让用户滚动正文寻找保存操作。

### 依赖与职责

- 高德：`@amap/amap-jsapi-loader` 加载官方 SDK，`@amap/amap-jsapi-types` 提供类型；
  绘制使用官方 MouseTool，区域编辑使用 PolygonEditor / CircleEditor。官方类型包缺少 PlaceSearch，仅在运行目录补这一项声明。
- 腾讯：官方 `tlbs-map-vue` 的 BaseMap、MultiMarker 管理地图和标记。
  Vue 包的 GeometryEditor 未暴露矩形图层，使用 `map_inited` 公开参数组合原生
  `TMap.tools.GeometryEditor`、MultiPolygon、MultiCircle、MultiRectangle，复用同一编辑器和图层。
  原生搜索和绘制使用 `tmap-gl-types`，不读取组件私有实例。
- 几何：按需引入 `@turf/destination`、`@turf/distance` 处理米制估算和等边约束，
  不自写球面距离公式；GCJ-02 上的计算为局部近似，不能替代测绘。
- OSM：`osmtogeojson` 仅在开发服务解析 Overpass 关系与面，`gcoord` 转换 WGS84 / GCJ-02；
  API 入口为 `src/api/maps/osm.ts`。不自写坐标偏移公式或关系拼接算法。
- 界面：Element Plus 输入、按钮、表格、滚动条、loading、空状态，以及公共 MyFeedback；
  自有布局使用 SCSS 和主题变量。
- 项目封装只管理 Key 数组、取消/超时、错误归类和业务数据回调。
  `map-runtime.html` 为同源独立入口，让官方全局加载器在每个实例中独立运行。

### Key 选择与资源加载

- 数组清理空值并按 Key 去重；从第一项开始加载，首个完成底图加载的会话继续使用。
- 每项的运行页和 SDK 初始化阶段各最多等待 15 秒；失败销毁容器后试下一项，每轮每项最多一次。
- 搜索只在明确凭证/权限/额度错误时继续尝试剩余 Key；无结果和普通网络错误不会换 Key。
- 全部失败显示页内反馈，用户可重新尝试全部项；不保存永久黑名单，避免配额恢复后仍不可用。
- 换配置、换厂商和卸载会取消旧任务；同厂商搜索故障切换保留手绘草稿。
- 每个会话用独立 iframe 隔离 SDK 的全局状态；同页多个实例可使用不同 Key。
  这用于生命周期与配置隔离，不是第三方脚本的安全沙箱。
- 官方 npm 组件和加载器按需打包，Vite 为运行页依赖生成带哈希的资源，可复用浏览器缓存。
  底层地图 SDK 仍按厂商要求在线加载，不下载到 public；其缓存遵循厂商 HTTP 规则。
  部署需保留 `map-runtime.html`，支持 `BASE_URL` 子目录；CSP、代理与域名白名单需按部署验证。

参考 [高德加载文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)、
[腾讯 GL 文档](https://lbs.qq.com/webApi/javascriptGL/glDoc/docIndexMap)。
Key 数组仅管理当前应用有权使用的凭证，不增加账号总额度，也不代表取得商业授权。

### 自动生成与多形态绘制

两家提供相同业务入口；项目可只配置并使用其中一家，未选厂商不加载 SDK。

1. 搜索并点击地点名称，选中后可“生成估算区域”；默认宽 400 米、高 300 米。
   长方形使用宽高，正方形使用边长，圆形使用半径（默认 200 米），范围均为 1～10000 米。
   多边形模式的估算入口生成长方形。修改尺寸后再次点击生成才替换草稿，不隐式修改已确认值。
2. “绘制区域”使用官方工具：高德圆/矩形按下拖动、松开完成，多边形点击并双击完成；
   腾讯按官方工具点击/移动并双击完成。正方形使用原生矩形交互，完成后以中心和较长边生成
   米制近似等边区域，边长上限 10 公里。完成前保留旧草稿，取消不覆盖旧区域。
3. 自动生成后适配视野，点击“确认区域”才向业务发出草稿；绘制和边界查询中不能确认旧区域。
   清空、换厂商、重试和卸载取消未完成任务；同厂商 Key 故障切换恢复完成的区域形态。

“编辑区域”使用官方工具拖动区域、调整控制点。矩形和正方形进入顶点编辑后按普通多边形保存，
不继续声称矩形/等边约束。圆形保留圆心与半径。多片和带洞区域选择“编辑轮廓”，一次编辑一个
外环或内环，应用时保留其它片区与内洞；编辑期间只显示选中轮廓，应用或取消后恢复整体。
“取消编辑”恢复进入编辑前的草稿；“应用编辑”只更新前端草稿，仍须确认并由业务后端保存。

### OSM 地点边界与大陆部署

点击“查找地点边界”后，通过同源接口查询所选位置周围 1500 米内有名称的场所面，
涵盖建筑、公司办公场所、商业、园区、医院、学校和休闲设施等常见标注，不限制医院分类。
按名称包含关系优先排列候选，仍要求用户核对并点击“使用此边界”；不会把最近或同名对象自动
当作所选地点。显示原始轮廓，保留多片和内洞；点要素、未闭合面、缺成员关系及超出复杂度限制
的要素不作为可用边界。单个候选最多 100 片、10000 个坐标，最多显示 20 个候选。
OSM 标注可能包含单栋建筑或不准确的用地，缺少名称或面轮廓的地点可能查不到，不能保证每个搜索结果都有真实边界。

- **浏览器入口**：`createOsmBoundaryLoader(endpoint)` 只接受同源路径。输入地点为 GCJ-02，
  请求前由 gcoord 转为 WGS84；返回 GeoJSON 再转换为 GCJ-02，供高德与腾讯统一显示。
- **开发服务**：`scripts/vite-osm-boundaries.ts` 提供 `/__map-data/osm-boundaries`，
  默认上游为公共 Overpass，`OSM_OVERPASS_URL` 可替换为自建实例。只允许固定场所面查询，
  不接受任意查询语句或上游 URL；单并发、请求完成后间隔至少一秒、12 秒超时、响应上限 2 MB，
  HTTP 私有缓存 10 分钟。开发服务重启会重置限流状态，仅供少量人工验证。
- **生产配置**：设置 `VITE_OSM_BOUNDARY_URL=/api/maps/osm-boundaries` 等同源路径；
  服务需接受 GET `lng`、`lat`（WGS84），成功返回标准 WGS84 GeoJSON FeatureCollection。
  feature.id 为 `way/<数字>` 或 `relation/<数字>`，properties.name 为名称；
  geometry 为 Polygon/MultiPolygon，完整保留内环。错误使用非 2xx HTTP 状态。
  这条接口返回标准 GeoJSON，不是项目 `ApiResult`，前端用 fetch 读取并在页内呈现错误。
- **大陆可访问性**：OSM 网站、瓦片、Overpass 是不同服务，不能用某一域名可访问推断其它服务。
  本地一次查询成功不代表大陆各运营商稳定可用。底图继续由高德/腾讯提供，浏览器不请求 OSM
  瓦片、海外查询接口或外部脚本。
- **正式部署建议**：国内后端使用自建 OSM 数据库/Overpass 或具有服务保障的数据供应商，
  接入统一鉴权、服务端限流、缓存与更新机制。仅把海外公共接口代理到国内域名并不能消除上游
  网络故障，也不能当作生产稳定性保障。公共 Overpass 明确不建议作为商业应用的长期后端，
  参见 [公共实例使用说明](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)。
- **署名及来源 TODO**：按当前界面要求暂移除操作区的大段版权说明，来源标识、链接和原始几何继续保留。
  正式分发前需补齐统一署名入口，并核对 [OSM 署名指南](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
  对地图来源可发现性的要求；统一页面的位置和地图入口待产品确认。

开发代理会查询真实外部数据，和业务 Mock 是两回事；它没有实现生产后端或区域持久化，
不会进入 `dist`，`pnpm preview` 不提供该接口。生产未配置同源路径时不启用 OSM 查询。
服务不可用或无轮廓时保留当前草稿，可继续手绘与估算，不自动改成矩形。

### 替换边界数据来源

业务传入 `loadPlaceBoundary(request)` 即可替换 OSM，例如改为已授权的厂商 AOI 服务：

- 输入 `{ provider, place, signal }`；请求应传递 signal，切换地点/厂商和卸载会取消过期结果。
- 返回 `MapBoundaryCandidate[]`，几何必须已转换为当前地图的 GCJ-02，空数组表示没有可用边界。
- 每个候选包含 `id/name/geometry/source`，可附 `sourceUrl`；OSM 用 `source: "osm"`，
  厂商 AOI 用 `source: "provider"`。不返回 SDK 实例，不交给前端服务端私钥。
- 组件最多等待 15 秒；失败保留旧草稿并允许重试；原始轮廓不转换为外接矩形。

高德的 [AOI 边界查询](https://lbs.amap.com/api/webservice/guide/api-advanced/search)
需要申请高阶权限；腾讯的 [AOI 边界查询](https://lbs.qq.com/service/webService/webServiceGuide/aoi)
为高级付费服务，可申请试用。OSM 数据源不等于已开通这两家的商业 AOI 权限。

### 当前业务边界与 TODO

已提供底图、搜索、取点、四种手绘、尺寸估算、OSM 候选查询、原始多片/带洞轮廓显示、
逐环编辑、应用/取消和确认。尚未完成全国场所覆盖率验证、跨片/洞拓扑及自交完整校验、
精确测绘、后端持久化与打卡判定。坐标转换是库算法结果，仍需用实际业务地标核对，
不能把社区边界或前端确认直接当作可靠打卡依据。

## MyTable 与整单保存

传 rows、fields、context、getRowKey；列只读取 table 白名单。表格默认显示主题联动的表头底色、斑马纹和完整行列网格线，经过行或列表头时提供轻量高亮，不保留点击后的十字锁定。业务列可在表头边缘拖动调整 64-1000px，选择列和操作列保持固定。标准 CRUD 列表会把拖拽结果写入现有列偏好，刷新后仍保留。“列设置”使用 MyDialog，以真实表头预览、分区/分组栏目轨道和当前设置面板统一调整显隐、顺序、列宽、对齐、密度和左侧/右侧固定。表头预览是快速操作面：普通列、分组标题和分组叶子均可点击定位，拖动时以未分组列或整个分组为单位在固定区域内或跨区域排序；搜索和显隐筛选期间暂停拖拽，避免局部结果与真实顺序混淆。下方结构列表与设置面板使用可折叠的 `el-splitter`，用户可调整宽度；结构列表负责层级浏览和显隐，设置面板负责精调属性。确定后整体保存，取消不改变当前列表。旧偏好缺少 fixed/align 时回退到源码配置，也可恢复单栏、整组或全部默认值。列可选声明 `headerGroup` 形成两层分组表头，分组配置可声明标题 `align` 和默认 `fixed`；同组叶子列可分别显隐、调整内容对齐和宽度，但不提供拖拽入口，组内顺序始终取源码配置。分组是不可拆的结构单元，只能整组移动或切换固定区域，用户可另行调整分组标题对齐；偏好读取和应用会自动收拢历史碎片。未声明时保持原单层表头。紧凑列表保持单行省略，舒适列表允许内容换行并按实际内容重算行高；CRUD 子表默认使用自动高度和换行展示，避免编辑控件、错误信息或较长字段被裁切。稳定行键不得使用索引，新行在页面生成 clientKey，不能等保存后才有键。列表翻页的 page-change、sort-change、selection-change 由页面更新受控状态。默认翻页清选择，跨页保留仅保证键，不承诺持有所有页的完整记录。

系统选择列和操作列是不可排序的边界列，始终分别位于表格最左和最右；用户固定的业务列只能排列在二者内侧。TableView 将左边界列、业务表头和右边界列组装成一个明确的渲染序列，避免条件节点与分组组件的挂载时序改变 VXE 的最终列顺序。

业务列的 `width` 是首选宽度，也是用户拖拽后保存的宽度；普通列会以它（或显式 `minWidth`）作为最小宽度参与剩余空间分配，因此列总宽不足容器时会自动铺满，容器不足时保持最小宽度并横向滚动。选择列、操作列和显式固定业务列保持精确宽度。不要在参照弹窗或业务页面传 `fit=false` 来绕过该兜底；需要窄列时直接把 `width/minWidth` 配得更小。

启用 edit 时传 createInitialRow 和可选 links。`presentation` 默认为 `inline`：适合少量短字段的高频录入；中等表单可用 `dialog`；字段较多或纵向内容较长时可用 `drawer`。后两者分别通过 `dialog.title/width/columns`、`drawer.title/width/columns` 调整统一 `MyForm` 编辑器。三种显示共用同一份 fields、links、行草稿、normalize、validate 和 commit/cancel 接口约定，不在浮层内复制业务规则。聚合子表不提供新页面模式；主表的新页面新增/编辑使用 `CrudNavigation.add/edit`。

startEdit(rowKey, field?) 打开独立行草稿；commitEdit() 校验后通过 row-patch 发出原子 patch，页面按 rowKey 合并。cancelEdit() 丢弃草稿。普通 blur 不提交，参照弹窗关闭不会误提交行。外部改行、删除、换页、条件变化会作废旧会话。校验失败时表格顶部显示可点击摘要、错误行带状态，行内单元格或弹窗表单显示完整字段错误；点击摘要和整单首错都复用 focusCell，在公共分页切换后先重算、横向/纵向滚动，再聚焦实际控件。

`MyCrudChildTable` 默认 `height="auto"`、最小高度 164px，并只在总数超过 `pageSize`（默认 10）时显示分页。业务页不要再按行数估算高度，也不要覆盖 VXE 私有样式；确需固定可视区时显式传 height/minHeight/pageSize。稳定行键仍不得使用索引。

保存整单按以下顺序，完整实现见 `src/pages/component-lab/table/index.vue`：

1. 页面上锁防重入，await tableRef.commitEdit()；失败停留当前草稿。
2. 校验主表与 tableRef.validate(全部明细)，不能只传当前分页。首错含 rowKey/field，页面先换页再 startEdit/focusCell。
3. 页面处理空明细、重复商品和金额规则；DTO 显式选字段，排除 clientKey、展示名称和未约定的计算项。
4. 调用页面 API；失败保留输入，finally 解锁；成功用回执 hydrate 新快照。

公开 props、事件和 expose 类型位于 `src/components/table/types.ts`。`engineOptions` 当前仅支持 `stripe`；不透传任意 VXE 配置，不启用编辑虚拟滚动、合并/展开组合。每个 MyTable 内相同 source/范围的显示 resolve 合并批次；保存校验仍强制复查，不使用显示缓存跳过验证。

## 验证与扩展边界

验证按改动范围执行：纯说明与模板注释检查链接、示例和注释位置；TS/Vue 改动运行类型检查，
行为改动补对应 Node 用例，交互改动使用浏览器检查实际路由；构建相关变动再运行 build。
不因补文档执行全量测试或新增测试依赖。具体命令见[根 README](../README.md)。
类型正反样例位于 tests/type-cases，开发实验路由用于观察公开能力，生产包不提供实验 API/Mock 后端。

纯工具按职责复用：搜索 normalizeSearchText、身份 serializeStableKey、空字段/筛选 isEmptyValue、金额 decimal、日期 date。isEmptyValue 只认为 null/undefined/空字符串/空数组为空，不 trim，不验证 ID。参照选择、请求会话、字段联动各留在所属模块，不混成宽松比较工具。

真实后端的批量 resolve、权限、鉴权、文件返回结构、持久化与整单事务仍待联调。新需求单独评估：Excel 本地导入导出、复杂筛选、虚拟滚动组合、独立保存子表、列偏好；本期没有自动启动这些能力。
