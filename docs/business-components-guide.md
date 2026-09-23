# 业务组件使用说明

本说明记录当前可用的参照、字段、表单、查询、详情和表格组件。新业务目录和 CRUD 装配方式分别见 [业务模块开发规范](./business-module-standard.md) 与 [CRUD 开发指南](./crud-development-guide.md)。公共组件不发送业务保存请求、不生成后端协议；Mock 回执不代表持久化。

## 先选择所需能力

| 场景                     | 入口                                                     | 状态归属与选择原则                                                                  |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 普通业务弹窗             | `src/components/common/MyDialog.vue`                     | 容器管理尺寸、桌面拖拽、全屏、复位、loading、默认动作和无障碍；业务管理内容与状态   |
| 标准列表/CRUD/主子表页面 | `MyCrudList`、`MyCrudForm`、`MyCrudDetail` 与 `useCrud*` | 装配层管理查询、分页、动作、保存、脏状态和详情加载；业务模块提供 config、DTO 和导航 |
| 独立客户/商品选择        | `src/components/business/MyReference/index.vue`          | 页面持有 ID；组件管理候选、回显与弹窗草稿                                           |
| 独立配置式编辑表单       | `src/components/business/MyForm/index.vue`               | 页面持有模型；组件管理快照、校验和联动                                              |
| 独立查询 / 详情          | `src/components/business/MySearch.vue` / `MyDesc.vue`    | 查询草稿独立；详情仅展示                                                            |
| 独立列表与行编辑         | `src/components/table/MyTable.vue`                       | 页面持有 rows、分页、排序、选择；组件管理活动行草稿                                 |
| 仅展示表格内核           | `src/components/table/TableView.vue`                     | 无分页/编辑业务状态；不反向引入字段体系                                             |

普通业务列表需要查询、分页、权限动作或列偏好时，优先使用装配层；单个字段、嵌入式局部表格或特殊页面仍可独立组合基础组件。MyCrud 内部复用 MyReference、MyForm、MyDesc、MyTable 和查询核心，没有替换其公开合同，现有独立调用可以继续使用。列表命令栏会按组装配新增/业务动作、快捷字段、查询命令、`toolbar-right` 和列设置，空间不足时换行，不在业务页复制第二条工具栏。

`MyDialog` 默认桌面可拖拽、窄屏禁用拖拽，支持全屏/还原并在关闭后复位；默认 footer 提供确认/取消和确认禁用原因，也可用 `footer` 完整替换，`actions` 用于标题栏扩展。参照、查询、系统维护、个人资料、通知、服务申请和子表行编辑等普通生产弹窗均已接入。快捷搜索也复用 `MyDialog`，禁用拖拽和全屏，使用独立输入管理焦点/键盘导航；组件实验页的直接用法仅用于嵌套焦点探针。`MyCrudForm` 默认只在顶部显示保存/关闭，`footer` 仅在业务显式提供时作为额外底部区域渲染。

把独立表单升级为标准 CRUD 时，保留原字段、source、links、稳定行键和 adapter，再将通用加载/保存/动作交给 `useCrud*`。子表只有参与整单事务时才注册到 `childKeys`；独立保存子表、复杂树表和虚拟滚动组合仍由业务页面单独设计。扩展先用公开插槽，不读取组件私有 refs 或 VXE 内部实例。

长文本 `textarea` 编辑默认显示 2 行，可通过字段 `props.rows` 调整初始行数；内容溢出可滚动，用户可纵向拖动调整高度。公共输入不启用异步自动高度测量，避免草稿恢复、只读切换或关闭浮层期间测量已卸载的文本框。

## 业务 source 与独立参照

新业务先在 API 模块声明 DTO 和请求，再在业务模块创建不可变 `ReferenceSource<Row, Id, Filters>`。复用项目 request 实例，其普通响应已经解包。source 的 search 接收 keyword、filters、conditions、pageNum/pageSize、purpose；返回 `{ list, total }`。resolve 批量接收 ID，返回 `{ items, unavailableIds }`，每个请求 ID 必须且仅能归入一处。系统错误 reject，不能当成记录缺失。把 context.signal 传给请求，采用 `errorPresentation: "local"` 避免重复消息。

可运行的三个 source 在 `src/pages/component-lab/reference/references.ts`；接口适配位于 `src/api/reference-lab/`。这些是开发数据示例，正式页面必须使用自己的 API，不引入实验模块。接口协议未知时先完成后端合同，不能扫描第一页猜测 ID 是否存在。

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
多选参照按实际弹窗内容宽度布局：宽容器固定左右区域同高，已选项只在右栏内部滚动；窄容器（包括桌面上的窄抽屉/弹窗）纵向排列并限制已选区高度。表单字段、紧凑查询栏和普通查询弹窗也按各自宿主容器宽度收为单列；组件不注册全局 resize 监听，表格仍复用 `TableView` 既有的 `ResizeObserver` 测量。

### 页面局部回写覆盖

共享参照可放业务模块 `references.ts`，主字段注册仍在 `config.ts` 内联。
`reference.withMap(callback)` 创建新实例，仅替换 map，不修改共享对象，不替换 source、filters、守卫或导航。
在 `add.vue/edit.vue` 的 `useCrudView` 或 `useCrudPage` 选项传入：

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

文本使用 `text`，长文本使用 `textarea`。紧凑表格默认单行省略；内容被裁切时悬浮单元格显示完整值，长文本或需要换行的子表显式使用现有舒适/换行呈现，不在页面重复实现省略和 tooltip。金额使用 `amount`：模型、DTO 和计算均为十进制字符串，字段层校验非负值、精度（默认两位）、上下界，不接受千分位或科学计数法；展示才调用 `decimal.ts` 的 `formatMoney`。日期支持 `date`、`month`、`year`、`datetime` 和 `dateRange`，分别按 `YYYY-MM-DD`、`YYYY-MM`、`YYYY`、`YYYY-MM-DD HH:mm:ss` 与两端日期字符串提交；区间要求完整且不允许逆序。`dateRange` 默认清空为 `[]`，页面模型用 `null` 表示空值时显式声明 `emptyValue: null`。

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

把 fields、context、createInitialModel 与 v-model 传给 MyForm，显式提供 mode="add" 或 "edit"。MyDesc 接收相同 fields、context、model-value，按 detail 展示。MyForm 方法类型为 `MyFormExpose<Model>`，实体加载用 hydrate(model)，恢复用 reset()；applyPatch(patch, reason) 用于普通变更，不能替代实体 hydrate。validate/validateFields 返回 `{ valid, stale?, errors }`，页面只有 valid 才提交。clearValidate 与 focusField 用于清理、定位错误。

隐藏字段保留值但不参与可见表单校验；只读与必填依据当前模式/context 展开。后端仍须鉴权。快照支持普通对象、数组、Date 与原始值，禁止函数、组件实例或循环结构。自定义字段插槽使用 setValue，避免直接修改父模型。

参照字段用 `createReferenceField<Model, Context>()({ source, filters, scopeKey, map })`，map 从 typed commit 返回 Partial<Model>；无需复制 MyReference 的回显或请求代码。客户变化清联系人等业务规则写在页面 fields.ts 的 `FieldLink`：显式 watch/writes/clear/apply。apply 为同步纯函数，环路、未声明写入、冲突会报错。hydrate/reset 不执行依赖清空。

MySearch 的 Query 独立于编辑 Model，用 `buildSearchFields<Query, Context>()` 定义，search.operator 只支持 eq/contains/in/between；between 对应 dateRange。传 fields、context、createInitialQuery，监听 submit/reset；普通输入不请求。高级条件折叠保留已填值。页面将一次事件转换为一次 API 请求，保留 0/false，完整日期范围再转换起止参数。

实际完整实例：`src/pages/component-lab/form/fields.ts`、`adapters.ts`、`index.vue`。第二个不同模型已在 `src/pages/component-lab/table/fields.ts` 和主表 MyForm 中复用，同 source 与字段工厂无实现复制。

### 富文本字段

富文本单独使用 `type: "rich"`，模型为 HTML 字符串（string 或 string | null），
不混用 textarea 的 rows。合同见 [RichTextProps](../src/components/business/fields/rich-text.ts)。

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

| 配置            | 类型            | 默认及语义                                           |
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

## MyTable 与整单保存

传 rows、fields、context、getRowKey；列只读取 table 白名单。表格默认显示主题联动的表头底色、斑马纹和完整行列网格线，经过行或列表头时提供轻量高亮，不保留点击后的十字锁定。业务列可在表头边缘拖动调整 64-1000px，选择列和操作列保持固定。标准 CRUD 列表会把拖拽结果写入现有列偏好，刷新后仍保留。“列设置”使用 MyDialog，以真实表头预览、分区/分组栏目轨道和当前设置面板统一调整显隐、顺序、列宽、对齐、密度和左侧/右侧固定。表头预览是快速操作面：普通列、分组标题和分组叶子均可点击定位，拖动时以未分组列或整个分组为单位在固定区域内或跨区域排序；搜索和显隐筛选期间暂停拖拽，避免局部结果与真实顺序混淆。下方结构列表与设置面板使用可折叠的 `el-splitter`，用户可调整宽度；结构列表负责层级浏览和显隐，设置面板负责精调属性。确定后整体保存，取消不改变当前列表。旧偏好缺少 fixed/align 时回退到源码配置，也可恢复单栏、整组或全部默认值。列可选声明 `headerGroup` 形成两层分组表头，分组配置可声明标题 `align` 和默认 `fixed`；同组叶子列可分别显隐、调整内容对齐和宽度，但不提供拖拽入口，组内顺序始终取源码配置。分组是不可拆的结构单元，只能整组移动或切换固定区域，用户可另行调整分组标题对齐；偏好读取和应用会自动收拢历史碎片。未声明时保持原单层表头。紧凑列表保持单行省略，舒适列表允许内容换行并按实际内容重算行高；CRUD 子表默认使用自动高度和换行展示，避免编辑控件、错误信息或较长字段被裁切。稳定行键不得使用索引，新行在页面生成 clientKey，不能等保存后才有键。列表翻页的 page-change、sort-change、selection-change 由页面更新受控状态。默认翻页清选择，跨页保留仅保证键，不承诺持有所有页的完整记录。

系统选择列和操作列是不可排序的边界列，始终分别位于表格最左和最右；用户固定的业务列只能排列在二者内侧。TableView 将左边界列、业务表头和右边界列组装成一个明确的渲染序列，避免条件节点与分组组件的挂载时序改变 VXE 的最终列顺序。

业务列的 `width` 是首选宽度，也是用户拖拽后保存的宽度；普通列会以它（或显式 `minWidth`）作为最小宽度参与剩余空间分配，因此列总宽不足容器时会自动铺满，容器不足时保持最小宽度并横向滚动。选择列、操作列和显式固定业务列保持精确宽度。不要在参照弹窗或业务页面传 `fit=false` 来绕过该兜底；需要窄列时直接把 `width/minWidth` 配得更小。

启用 edit 时传 createInitialRow 和可选 links。`presentation` 默认为 `inline`：适合少量短字段的高频录入；中等表单可用 `dialog`；字段较多或纵向内容较长时可用 `drawer`。后两者分别通过 `dialog.title/width/columns`、`drawer.title/width/columns` 调整统一 `MyForm` 编辑器。三种呈现共用同一份 fields、links、行草稿、normalize、validate 和 commit/cancel 合同，不在浮层内复制业务规则。聚合子表不提供新页面模式；主表的新页面新增/编辑使用 `CrudNavigation.add/edit`。

startEdit(rowKey, field?) 打开独立行草稿；commitEdit() 校验后通过 row-patch 发出原子 patch，页面按 rowKey 合并。cancelEdit() 丢弃草稿。普通 blur 不提交，参照弹窗关闭不会误提交行。外部改行、删除、换页、条件变化会作废旧会话。校验失败时表格顶部显示可点击摘要、错误行带状态，行内单元格或弹窗表单显示完整字段错误；点击摘要和整单首错都复用 focusCell，在公共分页切换后先重算、横向/纵向滚动，再聚焦实际控件。

`MyCrudChildTable` 默认 `height="auto"`、最小高度 164px，并只在总数超过 `pageSize`（默认 10）时显示分页。业务页不要再按行数估算高度，也不要覆盖 VXE 私有样式；确需固定可视区时显式传 height/minHeight/pageSize。稳定行键仍不得使用索引。

保存整单按以下顺序，完整实现见 `src/pages/component-lab/table/index.vue`：

1. 页面上锁防重入，await tableRef.commitEdit()；失败停留当前草稿。
2. 校验主表与 tableRef.validate(全部明细)，不能只传当前分页。首错含 rowKey/field，页面先换页再 startEdit/focusCell。
3. 页面处理空明细、重复商品和金额规则；DTO 显式选字段，排除 clientKey、展示名称和未约定的计算项。
4. 调用页面 API；失败保留输入，finally 解锁；成功用回执 hydrate 新快照。

公开 props、事件和 expose 类型位于 `src/components/table/types.ts`。`engineOptions` 当前仅支持 `stripe`；不透传任意 VXE 配置，不启用编辑虚拟滚动、合并/展开组合。每个 MyTable 内相同 source/范围的显示 resolve 合并批次；保存校验仍强制复查，不使用显示缓存跳过验证。

## 验证与扩展边界

运行 `node --test tests/*.test.mjs` 与 `pnpm build`。类型正反样例位于 component-lab 各模块，Vite 生成声明后由 vue-tsc 校验；实验路由只在开发模式注册，生产包不提供实验 API/Mock 后端。

纯工具按职责复用：搜索 normalizeSearchText、身份 serializeStableKey、空字段/筛选 isEmptyValue、金额 decimal、日期 date。isEmptyValue 只认为 null/undefined/空字符串/空数组为空，不 trim，不验证 ID。参照选择、请求会话、字段联动各留在所属模块，不混成宽松比较工具。

真实后端的批量 resolve、权限、鉴权、文件返回结构、持久化与整单事务仍待联调。新需求单独评估：Excel 本地导入导出、复杂筛选、虚拟滚动组合、独立保存子表、列偏好；本期没有自动启动这些能力。
