# 业务组件使用说明

本说明帮助你选择组件、准备参数并接入页面。只需要一个输入框、一项详情或一个参照选择器时，可以直接使用下面的独立组件；需要完整的列表、新增、编辑和详情页时，参考 [CRUD 开发指南](./crud-development-guide.md)。新模块的文件放置和配置写法见 [业务模块开发规范](./business-module-standard.md)。

独立输入和展示组件不会替你保存业务数据。标准 CRUD 会调用你配置的 API；目前 API 使用开发 Mock，重启开发服务后数据会重置。

## 先选择所需能力

基础交互先复用已有组件。标签右键菜单采用 [Reka UI Context Menu](https://reka-ui.com/docs/components/context-menu)
的基础组件，管理键盘选择、焦点返回与边界定位；标签关闭、草稿确认和缓存仍归原 store。
这是借鉴 shadcn-vue 组合方式的局部用法，不建立第二套表单、表格或样式工具链。
单选等已有能力继续使用 Element Plus。项目自有控件共用 `theme.scss` 的
`--ui-control-radius`、`--ui-popover-radius` 和 `--ui-focus-ring`，颜色跟随现有明暗主题。

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
