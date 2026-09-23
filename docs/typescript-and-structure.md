# 目录与 TypeScript 类型管理

本规范维护类型所有权、导入规则和现有类型清单；开发流程摘要见 [AGENTS.md](../AGENTS.md)，模块文件与配置归属见 [业务模块开发规范](./business-module-standard.md)。目录按职责划分，不追求固定的顶层目录数量。

## 1. 文件放在哪里

- 发请求、定义接口参数或响应：`src/api/<模块>/`。
- 项目设置、主题默认值、存储键、状态码约定：`src/config/`。
- 路由、全局状态：分别放 `src/router/`、`src/stores/`。
- 公共工具：`src/utils/`；纯规则不依赖 Vue/Pinia，网络和认证工具沿用已有入口。
- Vue 响应式复用逻辑：`src/composables/`；当前组件专用的逻辑就近放在组件内。
- 组件公开接口说明：跟组件一起维护；业务联动、表单草稿和 DTO 转换：跟页面一起维护。
- 图片、样式保留 `src/assets/`，应用布局保留 `src/pages/layout/`。

`config` 不再作为“其他公共内容”的总目录。不要同时建立 util/utils/helpers 或 hooks/composables；新目录必须有实际文件与调用者。

## 2. 类型的归属决策

先问“谁定义这个接口约定”，再决定是否共享：

1. 接口定义的结构，留在对应 API 模块，即使多个页面都使用它。
2. 组件定义的 props、事件、source、列等结构，留在该组件旁。
3. 页面自己组织的编辑草稿、视图模型，留在页面旁。
4. 函数、composable 或 store 的少量专属类型，与实现同文件。
5. 无具体业务归属的基础类型，才进入 `src/types/`。

因此，`FileInfo` 归文件 API，`ExcelResult` 当前归用户导入 API，`ReferenceSource` 归 MyReference；这些都不提升成全局类型。`PageResult<T>` 和 `OptionItem` 则是项目基础接口约定，可以集中管理。

### 当前共享类型目录

```text
src/types/
  http.ts            ApiResult、BaseQueryParams、PageResult
  common.ts          OptionItem
  env.d.ts           ImportMetaEnv、ImportMeta、__APP_INFO__
  router.d.ts        Vue Router 的 RouteMeta 扩展
  generated/         auto-imports.d.ts、components.d.ts
```

`types` 不能反向依赖页面、store、具体 API 或业务组件。不要在这里建立用户、客户、商品等镜像目录，也不要做一个导出所有组件/API 类型的总 index.ts。

## 3. “共享类型”与“全局声明”不同

普通共享类型需要显式导入。编辑器会帮助补全导入，也能追踪来源和引用：

```ts
import type { PageResult } from "@/types/http";
import type { OptionItem } from "@/types/common";
import type { UserItem } from "@/api/system/user/types";
import type { ReferenceSource } from "@/components/business/MyReference/types";

type UserPage = PageResult<UserItem>;
```

只有环境变量、构建常量和第三方模块扩展等使用声明文件。不要为省略 import，把 UserItem、FileInfo 或 ReferenceSource 写进 declare global。

- `.ts` 可以只包含 interface/type，不一定有运行时代码。
- `.d.ts` 用于描述已有环境或扩展已有模块，不是业务类型文件的通用后缀。
- `generated/*.d.ts` 由 Vite 生成，不编辑其相对路径或手工追加类型；移动目录后重新运行 Vite，再运行类型检查。
- `import type` 用于类型；enum、函数、对象常量等运行时内容用普通 import。

## 4. 接口 DTO、查询模型与页面模型

DTO 是接口上传输的数据结构；页面模型是页面实际编辑或展示的数据结构。两者相同就复用，存在实际差异才拆分。当前客户模块的实际归属是：

```text
src/api/base/customer/
  index.ts           请求函数与协议适配
  types.ts           CustomerRecord、CustomerSavePayload、CustomerSearchRequest
  query.ts           AST/排序白名单适配，不重复维护 UI 查询字段
src/pages/base/customer/
  types.ts           CustomerFormModel、CustomerPageContext
  adapters.ts        CustomerRecord、表单模型与保存 DTO 的明确转换
  config.ts          fields 声明查询意图并自动派生，不重新声明镜像 DTO
```

查询需要区分三层：

1. `QuerySchema/AppliedQuery/QueryDraft` 是查询组件与运行时的模型，所有者在 `components/business/search/types.ts`。
2. 新标准模块在 config.fields 声明查询意图，公共层按控件类型推导 schema；业务 API 只维护排序白名单和 SearchRequest/协议适配。旧费用模块的显式 API schema 接法仍兼容。
3. `CrudListConfig.toQuery` 把包含分页、排序、AST 和固定 scope 的 `CrudListRequest` 转成业务 API DTO；页面不能把查询 UI 值直接拼进 URL，也不能让用户条件覆盖固定组织范围。

标准模块采用 `defineBusinessModule<Contract>()` 的模块类型定义（见 [module.ts](../src/components/business/crud/module.ts)）：Model、Entity、Id、Schema、Scope、Query、Create、Update、Result、Context。字段 key/控件值、查询操作符覆盖、子表 modelKey/payloadKey 与行转换结果均保持类型关联；`createViewConfig()` 返回明确的 list/form/detail，无需非空断言。fields 模式的 Schema 使用 QuerySchema，派生 AST 的键在运行时按实际 fields 校验，不宣称任意手写 AST 都有有限键的编译期提示。查询和保存 DTO 不因共享字段而改为页面模型。

低层兼容入口 `CrudConfig` 的泛型顺序是 `Row, Entity, Model, Id, Schema, Scope, QueryDTO, CreateDTO, UpdateDTO, SaveResult, Context`。这些参数保持列表行、详情实体、页面模型、ID、查询、保存与上下文之间的关联，不用 `any` 或宽泛断言擦除。配置较大时可把字段放在 `*.config.ts`，但由模块 `config.ts` 作为唯一入口汇总；类型所有者不随配置拆分而改变。

命名表达用途，不强制给现有所有类型批量加 DTO 后缀：当前 UserQueryParams、UserItem、UserForm 可以继续使用。若 UserForm 本身就是 API 请求格式，留在 API；页面增加不可提交的 UI 字段后，再定义独立页面模型。页面 `types.ts` 维护表单、上下文及显式继承 BusinessModuleContract 的模块类型绑定，不复制 API DTO。

必须保持以下语义：

- 服务端 JSON 日期若是字符串，DTO 就声明为 string；不能仅因 TypeScript 写了 Date 就认为数据已转换。
- 数值 0、false 不当作未填写；单选参照空值为 null，多选为空数组。
- ID 按后端确定的类型维护，不随意把 string/number 相互转换；超出安全整数范围的 ID 保持字符串。
- 不使用 `as` 把未验证的后端结构直接伪装成目标模型。
- 后端尚未确定的字段列为待联调，不在目录迁移中猜测并改变原有协议。当前部分历史日期声明仍需在后端联调时核对。

CRUD 公共接口约定归 `components/business/crud/types.ts`：`CrudConfig`、list/form/detail 配置、controller、action、child binding 和 slot 类型都由组件层维护。`useCrud*` 的实现通过这些类型关联业务配置，不把客户、费用或实验 DTO提升到公共层。完整接法见 [CRUD 开发指南](./crud-development-guide.md)。

## 5. 文件、命名与拆分

- 模块统一使用 `types.ts`，不混用 type.ts/types.ts 命名。
- 文件明显变大且职责可独立后再拆为 query.types.ts、response.types.ts 等；不要一个 interface 建一个文件。
- 对象形状优先 interface；联合、映射、条件类型使用 type。名称表达领域，不另加一套 I/T 前缀规范。
- 类型很少、只与一个实现关联时，直接留在实现中。例如 UsePageTableOptions、TagView、StorageKey 无需为追求形式统一强行拆文件。
- 相同接口约定只维护一份。差异明确时用 Pick/Omit/交叉类型或独立模型，不复制相同定义后分别修改。
- 枚举、选项数组、默认值是运行时内容。系统业务状态在 `api/system/enums.ts`，界面模式在 `config/ui.ts`；不混进 `.d.ts` 或纯基础类型目录。

## 6. 维护检查

新增或调整类型时：

1. 搜索同名和同字段的已有定义及调用者，决定复用、适配或新增。
2. 根据所有者选位置；调整公开类型时更新对应的现行规范或组件使用说明。
3. 调整公共参数或返回值时需同步调用方，泛型关系保留必要正反例。
4. 运行 `pnpm type-check`；跨模块调整运行 `pnpm build`。行为与接口约定测试按本次改动的实际范围选择。
5. 目录迁移后检查动态路由、Mock、自动导入和相关浏览器页面，不能只凭编辑器不报错判断完成。

## 7. VS Code 事件导航

模板事件是组件的公开接口说明。组件在同目录 `types.ts` 导出 `XxxEmits`，组件以
`defineEmits<XxxEmits<...>>()` 声明；这样调用处悬停 `@事件` 能看到参数。
每个公开事件成员都写 JSDoc，说明触发时机、参数含义和调用方责任，并提供一行可复制的
`@example` 模板调用；避免只写“事件回调”这类无法指导调用的描述。
同样，所有公开 prop 写 JSDoc：必填 prop 说明数据来源与所有权，可选 prop 写明默认行为、
单位，以及如何关闭功能（例如 `false`、`null`）。

页面或组合组件不要把事件直接绑定到跨层 controller、store 或复杂内联表达式。先写一个
名称能说明用途的本地 `onXxx` 函数，再由它调用实际逻辑：

```vue
<MyTable @sort-change="onSortChange" />
```

```ts
function onSortChange(value: TableSort<CustomerRow> | null) {
  return controller.setSort(value);
}
```

这层适配既是业务边界，也让 Ctrl+点击首先进入可读的当前文件逻辑。需要追踪接口实现时，
再使用“转到实现”（Ctrl+F12）或“查看定义”（Alt+F12）；不为规避跳转而删除公共类型。

工作区固定使用本地 TypeScript；推荐安装 `Vue - Official`，并禁用 Vetur，避免两个 Vue
语言服务同时接管 `.vue` 文件。

### 公开 API JSDoc

公共函数、组件参数和事件的说明写在声明旁，方便调用时直接查看。内容先解释用法，格式再按下面的规则整理。

### 注释先回答使用问题

文档和注释面向第一次使用这段代码的开发者。按下面的顺序写，不要求每条短注释都列出三项：

1. **有什么用**：用于什么页面，解决什么实际问题。
2. **怎么用、传什么**：给出真实参数名、数据来源和最小示例，注明必传或可省略。
3. **会发生什么**：显示什么、何时触发事件、是否更新数据或发请求；有默认值和限制时说明。

例如组件开头不要写“标准详情装配，共享只读 controller”，而写：

```html
<!-- 显示记录详情、操作按钮和附加页签。传入 bindings.detail 即可使用，tab-* 插槽用于补充子表。 -->
```

参数不要只写“业务上下文”或“聚合端口”，而说明“当前组织、权限等信息，供字段筛选使用”或“子表的行数据与编辑方法，由 bindings.child('contacts') 获取”。

保留源码中真实的 `controller/bindings/context/DTO` 等名称，第一次出现时解释它的用途。必要的技术说明可以放在用法之后，例如请求取消、版本冲突和缓存隔离；不要为了少用术语而删除这些限制，也不要把技术名词换成含义不准确的近义词。

文档先给常用接法，再介绍自定义方式和内部实现。区分完整示例与局部片段；未实现的接口不能当作当前用法。模板注释说明整块内容，不逐个解释 div。

内部代码同样要说明用途，不以“没有导出”为由省略。适用于 `src/components` 和 `src/composables`，尤其是 `ref/computed`、请求版本号、订阅取消函数、`watch` 和生命周期回调：

- 状态和计算值：说明存的是什么、由谁更新、供哪个界面或流程使用；区分原数据、编辑草稿和已确认值。
- 监听器：说明监听什么变化、为什么要响应、会重置或刷新哪些内容。不能只写“监听变化”。
- 内部方法：说明解决什么问题、返回什么、会修改哪些状态；异步方法说明如何处理过期结果和失败。
- 复杂处理步骤：解释顺序或限制的原因，例如为什么先确认当前行再翻页。简单循环下标、直观的赋值不逐行复述。

复杂函数的头注释说明整体用途，函数体内则在关键步骤前用 `//` 说明接下来做什么、为什么按这个顺序做。例如保存函数应在确认子表输入、取得校验快照、写入提交保护标记、请求成功后回填等位置分别说明；异步等待后的版本检查应解释防止哪一种旧结果覆盖。失败分支说明保留什么数据、能否重试及重试哪一步，不用头部的一大段文字代替这些就近说明。

例如 `MyDesc.entries` 应说明“补齐布局默认值后，只保留开启 detail 的字段”，而不是“字段列表”；详情监听记录 ID 时，应说明“切换记录后回到默认页签，避免沿用上一条记录的子表”。变量与函数优先用 JSDoc，便于悬停查看；监听器和处理步骤可用普通注释。注释与实际实现一起维护，不描述计划中的能力。

### JSDoc 的格式

所有会被模块页面、其他组件或 AI 复用的导出函数、类型、组件 prop、事件和 expose，按复杂度
使用下面的最小结构：

````ts
/**
 * 一句话说明能力和结果。
 *
 * @typeParam Row 泛型参数代表什么。
 * @param options 输入来自哪里、是否会被修改。
 * @returns 返回值的状态所有权或可变性。
 * @remarks 缓存、取消、降级、受控数据、权限或副作用边界。
 * @throws 何种非法输入会抛错。
 * @example
 * ```ts
 * const result = reusableApi(options);
 * ```
 * @see RelatedContract
 */
````

不是每项都要机械使用全部标签：纯类型优先 `@typeParam/@example`，事件优先参数含义与模板
`@example`，可能丢数据、发请求、取消请求或写缓存的入口必须写 `@remarks`。`@example` 必须是
独立的多行标签，不能放在行内 `/** ... */` 注释中。

### 新增或修改公开接口时同步注释

适用于手写、AI 辅助或将来模板生成的代码；当前项目没有代码生成器，不为此新增生成器。

- **配置分区**：meta/api/model/fields/links/query/children/views 等大字段前必须有 JSDoc，说明该段职责。
- **核心目录全覆盖**：`src/components/business/` 所有 TS 文件都要检查，不限名为 types.ts 的文件；匿名 options、嵌套对象、联合分支、控制器状态和子表操作接口同样逐字段注释。`node --test tests/business-docs.test.mjs` 检查声明覆盖与 example 格式；只检查存在性，不替代语义审查。
- **配置成员**：公共 interface/type、props、事件、hooks、工具和模型/动作工厂的每个可配置成员，
  都在实际声明处写 JSDoc。继承后重新声明的成员也要补注释，不能只在 README 写说明。
- **说明内容**：含义、值从哪来、通常填什么、允许值、单位、默认/省略/false/null 行为。
  复杂成员提供可复制示例，必要时给默认用法与覆盖用法各一例；不能只把英文名字翻译成中文。
- **回调与事件**：写清参数和返回值、触发时机、是否允许修改输入、谁负责发请求/刷新/错误。
  网络写入、缓存、取消、草稿和覆盖默认流程必须说明副作用与限制。
- **标签格式**：@example 必须独占一行，多行代码使用代码围栏；按实际内容使用
  @param、@returns、@typeParam、@remarks、@throws、@defaultValue、@see，不堆无意义标签。
- **默认与覆盖**：便利方法说明默认做什么，哪个配置能够替换哪一步；不暗中猜测 DTO 或后端协议。
- **验证**：类型检查通过不等于悬停说明可用。检查实际配置处补全/悬停，
  重点 public API 可通过 TypeScript language service getQuickInfo 自动验证。
  同时测试默认流程、覆盖行为和错误分支。VS Code 扩展的最终展示仍需在编辑器检查。

标准模块的起点是 [Customer config](../src/pages/base/customer/config.ts)，
默认模型和动作方法见 [model.ts](../src/components/business/crud/model.ts)、
[row-actions.ts](../src/components/business/crud/row-actions.ts)。
