# 业务模块开发规范

本规范是新业务页面目录、命名和职责的单一事实来源。CRUD 公开 API 和可运行接法见 [CRUD 开发指南](./crud-development-guide.md)，类型归属见 [目录与 TypeScript 类型管理](./typescript-and-structure.md)。已存在的系统页面在实际修改时按范围迁移，不因本规范发布而一次性重写。

## 1. 先选择模块模板

按本次实际需求选择最小结构，不按可能出现的未来功能预建文件。

| 模板        | 适用场景                         | 最小必需内容                                      | 按需内容                                                            |
| ----------- | -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 简单列表    | 只查询、展示，或只有少量列表动作 | `index.vue`、`config.ts`、API 请求与 DTO          | 查询适配、特殊列插槽、页面 `types.ts`                               |
| 标准 CRUD   | 有独立列表、新增、编辑、详情路由 | 简单列表内容、`add.vue`、`edit.vue`、`detail.vue` | `adapters.ts`、`fields.config.ts`、业务参照、确有必要的共用编辑宿主 |
| 主子表 CRUD | 一次提交主表和一个或多个子模块   | 标准 CRUD 内容、子表字段与整单 DTO                | `detail/` 子模块、特殊草稿、业务联动、局部 composable               |

模板是文件职责和已验收用法，不是代码生成器。模块没有新增、编辑或详情能力时，不创建空路由页；简单子表能直接配置时，不创建包装组件。

新模块统一以客户 `src/pages/base/customer/` 的职责划分为结构基准，入口为 `/#/base/customer`；无子表时去掉 children 及相关装配即可。任务费用只作金额、批量动作和保存回执等局部能力参考，不作为目录规范范本。开发实验 `/#/component-lab/crud` 用于观察公共合同，不作为业务 API 或正式菜单入口。

## 2. 目录与文件职责

完整主子表模块可按实际需要形成以下结构：

```text
src/pages/<领域>/<模块>/
├─ index.vue               # 唯一列表路由入口
├─ add.vue                 # 新增页面与新增态装配；按需
├─ edit.vue                # 编辑页面与编辑态装配；按需
├─ detail.vue              # 详情薄路由入口；按需
├─ <Module>Editor.vue      # 非默认；主体与流程高度一致且抽取更清晰时才创建
├─ config.ts               # 模块唯一配置入口
├─ fields.config.ts        # 配置过大时的内部字段分片；按需
├─ types.ts                # 页面模型或页面上下文；有差异时创建
├─ adapters.ts             # DTO 与页面模型转换；有转换时创建
├─ references.ts           # 业务参照 source 绑定；按需
├─ children/               # 存在业务子表时创建
│  └─ <child>/             # 每个子表必须有 config.ts；呈现组件及其他文件按需
├─ detail/                 # 仅详情呈现片段；按需
├─ components/             # 不能由公开插槽表达的模块专属 UI；按需
└─ composables/            # 模块专属且确有复用的响应式业务逻辑；按需

src/api/<领域>/<模块>/
├─ index.ts                # 请求与服务端协议适配
├─ types.ts                # 请求、响应和 DTO 合同
└─ query.ts                # 排序白名单、AST 到请求 DTO 的适配；不重复声明 UI 字段
```

必须遵守以下边界：

1. `index.vue` 是唯一列表入口，不并存承担相同职责的 `main.vue`。
2. 每个配置所有者有自己的 `config.ts` 入口：路由页面读主 config，子组件读同级子 config；不越过所属入口读取内部字段分片。主 config 和主 adapters 可以导入子 config；子模块不反向导入父装配 config，也不读取兄弟模块内部实现，避免循环依赖。
3. 简单/示例模块的主字段、联动、动作声明和 children 注册直接写在 `config.ts`。确实变大后可按 `list.config.ts`、`form.config.ts`、`detail.config.ts`、`fields.config.ts` 拆分，由 `config.ts` 组合为一个可读的模块对象；不向页面分散导出互不关联的字段/列表/表单对象；不再创建同职责的 `crud.ts`，也不为单个字段建文件。
4. 新模块默认由 `add.vue`、`edit.vue` 分别维护新增、编辑页面装配，不额外建立只供它们转发的 `Create.vue`、`Edit.vue` 或 `modify.vue`。相同字段、子表配置、校验与 DTO 转换继续复用，各页独立创建控制器，不复制公共加载/保存机制。只有主体与流程高度一致、共用宿主简单且能减少维护成本时，才按需抽取 `<Module>Editor.vue`，不得把它作为必需文件。`detail.vue` 独立组装只读字段和动作。
5. 每个业务子表必须独立建立 `children/<子模块>/config.ts`，不论字段多少；该文件拥有字段、稳定行键、初始行、编辑呈现、归一化、校验、动作和子行 DTO 映射。没有业务含义的普通数组字段不因此强制变成子表。仅详情布局片段可留在 `detail/`。
6. 配置独立不意味着必须包装组件：简单子表直接在 section 使用 `MyCrudChildTable` 并传入独立配置；有专属交互或新增/详情复用时再建子组件。父 config 登记 children 绑定，由模块组合器生成 sections/childKeys、详情 tabs 和验证结果；父 adapter 通过同一绑定组合整单 DTO，不内联子表规则。跨主子表或跨多个子表的规则留在主模块。
7. `types.ts`、`adapters.ts`、`references.ts`、`components/`、`composables/` 都按需创建。没有实际调用者时不建空目录、空导出或只转发一行的包装。
8. 页面局部组件显式导入。只有跨模块存在相同语义和第二个真实调用点时，才评估提升到 `src/components/`、`src/composables/` 或 `src/utils/`。

## 3. 各模板的职责

### 3.1 简单列表

`config.ts` 至少提供稳定 `key` 和 `list` 配置；`index.vue` 建立业务上下文、导航和 `useCrudList`，再渲染 `MyCrudList`。仅当页面没有 CRUD 查询、分页、选择、动作或列偏好的需求，才直接使用更低层的 `MyTable`、`TableView` 或现有系统页结构。

简单列表不需要补齐表单/详情泛型对应的运行时代码，可继续使用低层 `defineCrudConfig`。标准 CRUD 使用下面的 `defineBusinessModule`，它保留已声明能力，页面无需 `config.list!`、`config.form!`。

### 3.2 标准 CRUD

标准 CRUD 由列表、新增、编辑和详情页组成。配置负责字段、查询、动作、DTO 转换、API 调用及导航接口；`useCrudList/useCrudForm/useCrudDetail/useCrudActions` 负责通用状态和异步生命周期。新增与编辑各自在对应路由文件装配业务上下文、控制器、字段与子表，不因拆页而重写通用保存、校验、脏状态和失败恢复。

以客户主模块为参照：`config.ts` 只公开 `customerModule`，按照 meta → api → model → fields/links → query → children → views 的顺序维护。每个大字段前写 JSDoc 导航说明；主字段和子表绑定默认内联，不把简单示例拆得四散。客户各页调用 useCrudView 并解构 state/actions/bindings；index 直接渲染 MyCrudList，add/edit 直接渲染 MyCrudForm，detail 直接渲染 MyCrudDetail。新增与编辑不共享 Editor；表单通过 bindings.child(key) 取得同一聚合绑定，在 section 插槽显式装配子组件。底层表单控制器继续复用。无子表业务省去 sections/childKeys 和子表 binding，不复制客户专属状态或地区逻辑。

新增/编辑分开维护的是页面装配与各自业务流程，不是重复定义共同规则。新增创建默认模型并调用 create；编辑按当前实例 ID 加载实体、携带版本并调用 update。即便采用共用宿主，各路由实例的 model、loading、dirty 和子表草稿仍独立，共用代码不等于共享编辑数据。抽取与否依据实际相似度和可读性，不以文件数量或代码行数决定；如果共用组件开始充满模式分支，应回到独立页面，保留真正共用的配置和函数。

批量动作是 index 的例外职责：动作码、权限、全查询许可和专属规则由 index 交给
`useCrudView` 的 batch 选项，内部复用 useBatchActions；config 只声明 `meta.componentKey` 与 `batch.field/getValue`。
新增/编辑入口形态由 `page.add/edit.mode` 配置，默认 tab；dialog/drawer 通过公共
`MyBusinessPageHost` 装载原 add/edit 页面。接法和失败语义见 [CRUD 指南](./crud-development-guide.md)。

### 3.3 主子表 CRUD

标准模块在 `children` 登记绑定，由 `defineBusinessModule` 自动生成 `CrudFormConfig.sections/childKeys` 与详情 tabs、子表多行校验；低层使用者仍可显式登记。useCrudView 复用 useCrudTableChild 建立绑定，bindings.child(key) 不重复注册；页面显式使用子表组件，详情从 state.model 读取只读子行。旧 useCrudPage/MyCrudPage 仍兼容配置自动渲染；非表格子模块使用 `controller.registerChild` 的公开合同。保存顺序、锁定、校验、失败状态和回填由 `useCrudForm` 统一编排。

客户是实际样例：联系人和地址分别位于 `children/contacts/`、`children/addresses/`，各自拥有配置和呈现组件；新增、编辑时可维护，详情时只读。主要联系人、默认地址、初始行、子行校验和 DTO 白名单归子模块，地区级联仍归父模块，不进入公共组件。

持久化模式必须与真实 API 一致：`aggregate` 表示子行随主表整单创建/更新；`independent` 表示已有主实体后通过独立端点和独立版本保存；`by-mode` 只在新增态聚合、编辑态独立。当前客户只有整单 DTO 和 Mock 端点，运行时仅支持 `aggregate`。实现后两种模式前必须补齐独立 DTO、权限、版本/并发、删除确认、事务或部分失败恢复和联调记录，不能由 Mock 外观推断。

### 3.4 一套字段，按场景派生

标准模块使用 [defineModuleFields / compileModuleFields](../src/components/business/crud/module-fields.ts)。
字段 label、type、options、props 和通用 form 规则只维护一次；`scenes` 仅说明参加哪个场景及少量差异。

| 配置              | 省略 / false                                    | true                      | 对象                                       |
| ----------------- | ----------------------------------------------- | ------------------------- | ------------------------------------------ |
| form              | 无通用表单规则                                  | 不支持                    | 新增/编辑的公共布局、必填、校验            |
| scenes.add / edit | 省略继承 form；false 不展示也不做该场景字段校验 | 启用并继承 form           | 在公共 form 上浅覆盖                       |
| scenes.list       | 不作为列表列                                    | 复用 key/label            | 列宽、表头、排序、链接、format 等          |
| scenes.detail     | 不作为详情字段                                  | 复用字段类型及公共 detail | 分组、跨度、格式等覆盖                     |
| scenes.query      | 不生成该字段的查询入口                          | 不支持                    | normal/advanced/keyword 意图，可覆写 input |

数组顺序即默认顺序；场景 `order` 数值越小越靠前。新增/编辑差异仅覆盖当前场景，
不复制字段数组；`rules` 是整体替换，不隐式拼接。复杂控件继续使用字段公开插槽。
`scenes.add/edit` 只覆盖表单规则，不改变字段值类型或控件类型。
字段关闭不代表禁止提交或删除模型值，保存权限及提交白名单仍由 API/adapter 保证。

列表与详情共享页面模型；接口响应结构不同则在 `api.list`、`model.fromRecord` 显式转换，
不能使用断言伪装。只读审计字段可存在模型中，但不配置 form，也不进入草稿及保存白名单。
不自动猜测关联 ID/name 的转换。

标准模块在 `query: { source: "fields" }` 下从字段推导查询，不再单独维护同一套 UI schema。
模块合同的 Schema 填 `QuerySchema`；字段 key/控件/操作符覆盖由 `ModuleField` 约束，运行时
派生的 schema 负责 AST 字段与值校验。API 只保留 DTO、排序白名单、请求协议适配；
后端必须独立校验字段/操作符/枚举与权限，不能把前端推导当作安全边界。

```ts
fields: [
  {
    key: "customerName", label: "客户名称", type: "text",
    form: { required: true },
    scenes: {
      list: { minWidth: 200 },
      query: { normal: true, advanced: true, keyword: true },
    },
  },
  {
    key: "active", label: "启用", type: "switch",
    scenes: { query: { normal: true, advanced: true } },
  },
],
query: { source: "fields" },
```

- `normal/advanced` 默认 false；省略整个 query 就不参加。普通查询采用操作符列表首项。
- `keyword: true` 仅文本可用；自动生成一个顶部关键词框，请求前展开为参与字段的 OR 组，
  再与其他条件组合。列表和批量查询共用转换；keyword 不进入表单模型、草稿或保存 DTO。
- `key` 默认当前字段名，仅后端别名不同才填写。API 不反向导入页面 config。
- select 的选项、静态 dict 的 code/valueType 自动复用；字典 UI 沿用公共请求合并机制。
  字典输入校验值类型，选项合法性最终由服务端校验；静态 select 仍校验完整选项白名单。
- 参照默认字符串 ID；数字 ID 显式 `valueType: "number"`。复杂输入仍用 `input: createQueryReference(...)`。
  查询不拥有编辑表单 model，不自动挪用依赖 model 的省市区 filters。
- `operators` 通常不填。少数场景覆盖时必须是非空数组，整体替换默认列表，
  首项决定普通查询默认操作符；TS 与运行时均拒绝类型不匹配的操作符。
- 当前自动推导支持 text/textarea、number、amount、date/datetime、switch、select、静态 dict、
  reference。month/year/dateRange、复合/自定义控件、动态 code 或 preserve 字典暂不自动猜测：
  启动时明确报错，可使用既有显式 schema/input 接法。不要为通过编译强制断言。

| 字段类型                  | 普通查询默认 | 高级查询默认能力                              |
| ------------------------- | ------------ | --------------------------------------------- |
| text / textarea           | contains     | 包含、等于/不等于、前后缀、为空/不为空        |
| number / amount           | eq           | 比较、区间、为空/不为空；金额保持十进制字符串 |
| date / datetime           | between      | 区间、比较、为空/不为空                       |
| switch                    | eq           | 等于/不等于、为空/不为空                      |
| select / dict / reference | eq           | 等于/不等于、属于/不属于、为空/不为空         |

兼容旧模块的 `query: { schema, initial, standalone }`：保留原 API schema 的合同和入口，
`scenes.query` 仅映射 key/input；不将新入口标志混入旧 schema 模式。费用等旧模块不强制迁移。
固定组织范围继续用 scope，不能作为可修改条件。

### 3.5 子表归属：父模块登记绑定，子表维护行规则

使用 [defineAggregateBinding](../src/components/business/crud/aggregate.ts)。
父模块知道页面模型和整单请求，因此由父模块维护两者关系；子配置不需要认识父模型：

- `modelKey`：主页面模型的数组属性，也是注册 key、表单 section、详情 tab 的 key。
- `payloadKey`：整单 DTO 的数组属性；允许与 modelKey 不同。
- `config`：独立子表配置；含 title、validateRows、persistence.mode/toPayload 等子行规则。
- `binding.toPayload(model)`：从 modelKey 取数组并调用子行转换；父 adapter 用 payloadKey 组装 DTO。

两个 key 都受 TypeScript 数组字段约束；子行转换结果必须匹配目标 DTO 数组。
重复 modelKey/payloadKey 在模块定义时拒绝，不能覆盖同一份数据。
`modelKey` 是实际属性而不是 `"master.items"` 这样的字符串路径；
嵌套后端协议在 API adapter 中显式封装，不引入无类型的路径解析。

简单及示例模块的 children 直接写在主 config 内，不为了复用再拆关系文件。
需要模型转换读取绑定时，写 `model: children => defineBusinessModel<Contract>()({...})`，
由公共模块注入当前 children，adapter 通过参数接收，不反向导入 config。
子表的行字段、校验和编辑呈现仍必须留在 `children/<name>/config.ts`。
对象登记名仅是开发访问名；运行时绑定以 modelKey 为准。
`AggregatePayloadBindings<Model, DTO>` 适合按 DTO 数组名登记的保存适配；
登记名与 DTO 数组名不同时，显式传入对应绑定，不用断言假装一致。

子表独立配置不等于独立保存。主表 create/update 各发一次整单请求，
先完成子行编辑、字段及跨行校验，再构建提交 DTO；空数组也要显式发送，不按 truthy 丢弃。
新后端提供 `saveMasterDetail` 时在 API 层适配请求外壳，并由模块
`api.create/update` 调用；当前不虚构接口 URL、事务或真实持久化。

### 3.6 默认模型/动作封装与覆盖

`CustomerContract` 等模块合同在页面 `types.ts` 显式 `extends BusinessModuleContract`：
它将通用 Model/Entity/Id 等类型参数具体化，不是另一套平行接口。覆盖成员也写 JSDoc，
不能假定 TS 必然显示基类文档。只有公共合同本身不够约束业务时才增加成员。

普通模型使用 [defineBusinessModel](../src/components/business/crud/model.ts)：
默认隔离新增初值、回显结果和保存输入，新增调用一次 toPayload，
编辑调用相同 toPayload 后再执行 updatePayload。可用 overrides 替换指定步骤；
不覆写的步骤保留默认行为。保存 DTO、乐观锁和回执映射必须明确，不能猜测后端协议。

常见行操作使用 [defineRowCommands](../src/components/business/crud/row-actions.ts)：
每项直接写 key、label、visible/disabledReason 与 request；
默认补充权限前缀、确认文案和成功回执。confirm:false 可关闭确认，
permission/successMessage/execute 可覆盖。工厂仍交给 useCrudActions 执行，
不重复实现 loading、确认框、错误捕获和刷新，不把客户状态规则硬编码进公共层。
详情删除后的关闭属于业务差异，通过 afterExecute/refresh 明确配置。

## 4. 配置、类型和 API 边界

### 配置归属速查（唯一维护处）

“公共配置”必须先判断所有者，不能把业务字段都堆进 `src/config/`。按文件编写的示例见 [模块开发实操](./module-development-example.md)。

| 内容                              | 存放位置                                                              | 写什么 / 不写什么                                                              |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 环境地址、Mock 开关、开发工具开关 | 根 `.env.*`、不提交的 `.env.development.local`                        | `VITE_APP_API_URL`、`VITE_APP_BASE_API` 等；`VITE_*` 会进入客户端，不能存密钥  |
| 开发代理、构建插件                | 根 `vite.config.ts`                                                   | 构建行为；不配置业务表单或某模块端点                                           |
| 应用标题、主题默认值              | `src/config/app.ts`                                                   | 全应用默认设置；业务页面不另建主题                                             |
| UI 模式、全局存储键、响应码       | `src/config/ui.ts`、`constants.ts`、`api-codes.ts`                    | 各自职责的稳定常量，不放客户状态或字段数组                                     |
| 请求实例、认证、响应外壳          | `src/utils/request.ts`                                                | 通用传输规则；不放具体业务查询或回填                                           |
| 模块 URL、HTTP 方法、请求调用     | `src/api/<领域>/<模块>/index.ts`                                      | 模块内 `BASE_URL`、signal、响应类型；页面不拼接口 URL                          |
| 服务端字段、请求与回执            | 同 API 目录 `types.ts`                                                | DTO、版本、分页、枚举等后端合同；不混 UI 草稿                                  |
| 排序白名单与请求映射              | 同 API 目录 `query.ts`                                                | AST 到后端 DTO 的转换；UI 查询字段归 config.fields，不硬编码页面登录上下文     |
| 列、表单、详情、动作、导航装配    | 页面目录 `config.ts`                                                  | 唯一公开配置入口；大文件按职责拆 `*.config.ts` 再汇总                          |
| 字段规则、格式、字段联动          | 页面 `config.ts` 或内部 `fields.config.ts`                            | label、类型、必填、校验、回填；不是 API DTO 定义                               |
| 参照绑定与选择后的业务映射        | 页面 `references.ts`、字段配置                                        | 复用 source 并绑定 filters/scope/map；传输仍归 API                             |
| 页面模型和 DTO 转换               | 页面 `types.ts`、`adapters.ts`                                        | 草稿、初始值、归一化、提交白名单；协议解包不放这里                             |
| 子表业务配置                      | `children/<子模块>/config.ts`                                         | 行键、字段、初始行、校验、DTO 映射；父入口汇总                                 |
| 共享组件默认行为 / 合同           | 对应组件目录；通用响应式逻辑在 `src/composables/`                     | 不引入页面类型、业务 URL 或固定组织                                            |
| 纯格式化、精确金额、日期与身份键  | `src/utils/` 对应现有文件                                             | 先检索复用；业务状态转换仍留模块                                               |
| 菜单、隐藏路由、按钮权限          | 当前 `mock/menu.mock.ts`、`mock/user.mock.ts`；正式后端菜单与权限接口 | 路由转换由 `src/stores/permission.ts` 维护；不把正式业务绕过权限链塞进实验路由 |
| 开发数据与失败分支                | `mock/<模块>.mock.ts`，种子数据大时拆文件                             | 模拟当前声明的合同；不由浏览器 Mock 成功推断真实权限或持久化                   |

API 返回的业务字典使用现有字典能力，不在页面复制一份选项；仅模块内部使用的固定选项留在模块配置。确实跨业务共享的领域 source/规则按现有主数据所有者复用，不因“两个文件都用到”就提升到全局 config。

### 强制边界

- `src/components/business/crud/types.ts` 拥有 `CrudConfig`、各分区配置、控制器、动作、子模块和插槽合同；业务模块通过显式 import 使用，不声明为全局类型。
- 新标准模块的查询界面从 config.fields 派生；API 持有请求 DTO 与协议适配。旧费用模块仍支持显式 schema，不能要求新模块重复维护字段。
- 固定组织、租户或权限范围由 `scope(context)` 产生 `QueryScope`，不能混入用户可编辑查询条件。`scope.key` 同时隔离请求、参照和本机偏好；它不是鉴权凭证。
- API DTO 归 `src/api/<领域>/<模块>/types.ts`。页面表单、草稿和上下文与 DTO 不同才放页面 `types.ts`；显式转换放 `adapters.ts`。
- ID 保持确定类型，`0` 是有效数字 ID；大整数保留字符串。日期和金额按接口合同保留字符串，金额计算复用 `utils/decimal.ts`。
- 权限字符串放在动作或表单配置中，路由和菜单权限沿用现有动态菜单链。前端隐藏/禁用只负责体验，服务端必须再次鉴权和校验范围。
- 页面只调用 API 模块，不拼 URL、不拆响应外壳。由页面或 CRUD 控制器呈现 loading、错误和重试的请求，API 方法必须接收并透传 `AbortSignal`，同时使用 `errorPresentation: "local"`，避免过期请求覆盖新状态或与装配层重复提示。动态路径段统一 `encodeURIComponent`；取消只结束前端等待，不代表服务端写入回滚。

## 5. 状态、导航与失败语义

- 页面默认使用局部状态；只有多个独立路由确实共享且需要长期保留的状态才进入 Pinia。
- 列表首次挂载由 `useCrudList` 自动读取；查询草稿、已应用查询、分页、排序、选择和动作状态不在页面再维护一套。搜索、翻页和排序会清当前页选择。
- 新增和编辑通过 `controller.open(target)` 切换；关闭通过 `controller.close()`，路由离开由 hook 处理脏状态。不能直接替换模型绕过守卫。
- `CrudNavigation` 的回调返回 `Promise<void>`。新增、编辑、详情、保存后和关闭的真实路由由模块提供；同时配置菜单、隐藏子路由、权限和 keepAlive 名称。
- 明确的校验或服务端拒绝保留输入，允许修正后重试；写请求结果未知时禁止重复提交；写入已提交但回填失败时只调用 `retrySync()`。AbortSignal 取消前端等待不代表服务端回滚。
- 列表与详情动作复用 `CrudAction`。可见、权限、禁用原因、确认、单飞、部分失败和刷新策略由公共执行器处理；状态转换和接口文案仍在业务配置。

## 6. 页面与样式

- 新组件使用 `<script setup lang="ts">` 与 Composition API；props、emits、请求和响应显式建模，不用无约束 any 或断言掩盖类型问题。类型归属详见类型规范。
- 页面模型、查询、勾选、弹窗与提交状态分开；只有真正跨页面共享的状态进入 Pinia。异步流程恢复 loading、避免重复提交，取消确认是正常分支。
- 普通列表不重复显示模块大标题；搜索、业务操作、列设置和表格在 `MyCrudList` 的同一容器内，分页使用公共组件并右对齐。
- 表格默认紧凑、单行展示；确需双行时配置 `CrudColumn.secondary`，需要复杂内容时使用 `column-<field>` 插槽。
- 字段的 label、必填、placeholder、help、formatHint、readonlyReason 通过字段合同表达。通用错误、说明和只读呈现不在每页写 CSS。
- 页面可使用少量 scoped 样式表达业务内容，例如任务费用的本页金额合计。常规工具栏、分页、表单、详情、错误和窄屏布局归公共组件或 `assets/styles/page.scss`。
- 业务页面不得通过 `.el-*`、`:deep()` 或 VXE 私有结构覆盖公共组件来实现常规布局。发现公共样式缺口时检查现有调用点后在公共所有者修复。
- 颜色、间距和明暗主题使用现有 CSS 变量；窄屏允许工具栏和分页换行，表格在自身区域横向滚动，不能造成整页横向裁切。

## 7. 扩展与不适用场景

先使用公开扩展点：列表的 `toolbar-left/right`、`query-<key>`、`column-<key>`；表单的 `field-<key>`、`section-<key>`、`footer`；详情的 `tab-<key>`、`actions`、`footer`。插槽只接收只读状态和公开命令，不访问组件私有 ref、VXE 实例或页面实例链。

以下场景可以直接组合基础组件或保留专属页面：复杂树表、合并/展开与虚拟滚动组合、审批流程设计器、地图/富交互画布、独立保存型子表、分步骤事务、多实体并行编辑，以及装配层无法表达的特殊布局。仍要复用 MyReference、MyForm、MyTable、Pagination、请求和工具等已适用能力。出现第二个相同缺口后再评估兼容增强公共合同，并记录现有实现为什么不足及受影响调用。

本期没有服务端常用查询方案保存、跨设备列偏好、通用导入导出、通用审批引擎、代码生成器或可视化配置器，不在新模块中假定这些入口存在。

## 8. 路由、迁移和交付流程

新模块从创建起执行本规范。旧模块只在实际需求影响的范围内迁移：先保持现有行为，再逐步收敛入口、配置和公共流程，不为统一目录批量改写无关页面。默认不在每个业务目录复制 `AGENTS.md`；只有领域确有额外约束时才建立局部文件，并写明生效范围。

后续 Agent 按以下顺序工作：

1. 首次进入阅读根 `AGENTS.md`、`README.md`；新模块完整阅读本规范，再按 `docs/README.md` 定位实操、CRUD 相关章节及目标模块。局部改动按任务选读，已读未变内容不重复加载。
2. 在简单列表、标准 CRUD、主子表 CRUD 中选最小模板。
3. 检索目标模块、公共组件、composables、utils、API 和已安装依赖，记录复用与缺口。
4. 先定义真实 API DTO、查询映射、页面模型、固定范围和权限动作，再组织 `config.ts`。
5. 接入装配组件和 hooks；业务差异先用配置、公开插槽与显式函数，必要时才增加局部组件/composable。
6. 同步菜单、路由、隐藏子路由、权限、标签页名称和返回路径。
7. 验证查询、分页、选择、保存、取消、失败恢复、权限动作；主子表还要验证草稿、全量校验和首错定位。
8. 按影响运行行为测试、类型检查、构建和浏览器回归，更新模块说明、类型入口与实际限制。

交付记录必须区分 Mock 与正式后端。当前客户和任务费用写入仅在开发服务进程内保留，重启恢复种子数据；真实组织/数据权限、接口 URL、事务、版本冲突、取消、幂等、附件、时区和部分失败协议仍需联调。
