# CRUD 开发指南

> 标准业务模块现在优先从 [模块实操](./module-development-example.md) 的 `defineBusinessModule`
> 入口装配：一套字段按场景派生、子表绑定生成注册信息。本文的 `defineCrudConfig` 和可选
> `list/form/detail` 是仍兼容的低层合同，不要求将已定义的模块再次拆成多份配置。

本指南说明当前已交付的 `MyCrud* + useCrud*` 接法。目录选择先读 [业务模块开发规范](./business-module-standard.md)；公开类型以 `src/components/business/crud/types.ts`、`src/components/business/search/types.ts` 和各组件源码为准。

文中的业务代码都从当前任务费用或客户模块裁剪，省略处会明确指出。新模块结构统一以 customer 为基准，按文件接法见 [模块开发实操](./module-development-example.md)；下文费用片段仅解释相应公共能力，不作为模块结构范本。完整可运行入口是 `/#/task/fee`、`/#/base/customer` 和开发模式的 `/#/component-lab/crud`，不要把实验 API 或固定组织值复制到正式模块。

## 统一页面入口与可选生命周期

标准模块使用 `useCrudView(module, { view, state?, hooks?, navigation?, batch? })`，
解构 `{ state, actions, bindings }`，模板直接引用 `MyCrudList/MyCrudForm/MyCrudDetail`，
从组件名即可跳转真实源码。[五类文件接法](./module-development-example.md#6-页面最终形态)
以客户为参照。旧 `useCrudPage/MyCrudPage` 保留配置自动渲染兼容入口；两种入口复用同一装配实现，不要在同一界面同时调用。

| 位置                              | 内容与所有权                                                   |
| --------------------------------- | -------------------------------------------------------------- |
| config.fields/links/children      | 共享字段、联动和子表规则；子表各有 config                      |
| config.views.form/list/detail     | 公共生命周期与场景策略                                         |
| options.hooks                     | 本界面的追加业务行为；公共规则先执行                           |
| state.custom                      | 工厂创建的辅助数据，可直接修改，不进入 DTO、草稿或 Pinia       |
| state.model / rows / dirty / busy | 原控制器的只读实时状态，不复制模型                             |
| state.pagination                  | 列表页码、每页条数和总数；用 actions.setPage 修改              |
| actions                           | 按场景提供 patch/save/refresh 等命令；表单 back 经过离开守卫   |
| bindings.form/list/detail         | 直接传给真实组件的 props，保留同一控制器                       |
| bindings.child(key)               | 表单的同一子表端口，setup 中读取；每个配置分区必须挂载对应组件 |
| bindings.host                     | 列表/详情的弹窗与抽屉宿主 props；存在时挂载 MyBusinessPageHost |
| options.navigation                | 替换指定导航；saved 仅在保存回填成功后调用                     |

state 工厂每个实例创建普通对象，只放可快照数据，不放组件、函数或循环引用。
`const { state, actions, bindings } = useCrudView(...)` 可安全解构；不要把
`state.busy` 等原始值再次解构到普通变量，派生值使用 computed。
表单通过 `actions.patch` 或字段插槽 `update` 修改模型，不直接写只读 `state.model`。
`actions.back` 处理表单提交锁与未保存确认，不以裸路由替代。

钩子参数的 `state.custom` 是辅助数据只读快照；初始化时模型尚未就绪，因此模型或查询行仍从同级
`model/rows` 参数读取，而不是在钩子 state 中提供一份可能过期的模型。
`beforeOpen` 返回的 `{ state: { hint: "已准备" } }` 是 custom 补丁，格式与 state 工厂一致，
不是替换整个视图 state。补丁应用前后检查 signal，迟到结果不更新状态；
其他钩子的异步外部副作用由业务透传 signal，并在执行前检查取消。

直接组件布局在根节点使用公共 `page-container crud-page`，展示 `state.notice`；
存在 `state.invalidReason` 时显示错误并停止挂载业务组件，避免缺失编辑 ID 时误显示新增表单。
详情的默认编辑按钮显式读取 `state.canEdit/editReason/busy` 并调用 `actions.edit`；
该命令执行时会再次复核权限和只读状态。

### 主表字段确认：hooks.change

可选 `hooks.change` 监听用户完成编辑后的事务，不用深度 watch 整张表单。
它与实时模型回写分开：输入过程中模型、脏状态和同步 links 正常更新，
业务 change 等待确认；未配置时不拍摄确认事务快照，也不创建异步 change 通道。

| 场景                                       | 通知时机                                                |
| ------------------------------------------ | ------------------------------------------------------- |
| text / textarea / amount                   | 控件原生 change，通常是值改变后的失焦或回车；不逐字通知 |
| number                                     | 数字控件 change                                         |
| select / dict / switch / date / upload 等  | 控件完成值更新后                                        |
| reference / region                         | 主 ID、map 回填和该次同步 links 全部完成后              |
| rich                                       | 编辑区失焦时确认待处理变化                              |
| 自定义字段插槽                             | update/setValue 回写后，由插槽显式调用 commit()         |
| hydrate / reset / actions.patch / 草稿回显 | 不冒充用户确认，不触发 change                           |
| 子表行                                     | 继续使用子表公开事件，不归本主表字段钩子                |

`field` 是主触发字段；`changes` 包含回填、级联和并行同步规则实际改变的字段。
`previous/model` 是开始交互前和确认后的只读快照；相同值、输入后恢复原值且没有其他变化、
重复 commit 均不重复通知。参照依赖清空标为 `reason: "dependency"`，
用户输入标为 `"user"`，可在回调中筛选。

```ts
hooks: {
  change: async ({ field, model, changes, state, reason, signal }) => {
    if (reason !== "user" || field !== "provinceId") return;
    signal.throwIfAborted();
    // 此时 model.provinceId/provinceName 已一起回填，下游同步清空规则也已完成。
    // 有远程补充时 await 自己的 API 并透传 signal，不在此提交整单。
    return {
      state: { hint: model.provinceName ? "已选择：" + model.provinceName : "已清空省份" },
    };
  },
}
```

返回值可为 void，或 `{ state?: Partial<CustomState>, patch?: Partial<Model> }`。
state 合并 custom；patch 走原表单更新/联动，不递归触发用户 change。
同步派生值优先放 config.links；异步补充返回结果，不直接改只读快照。
准备结果以整张表单的最新输入为准：新输入、外部模型变化、上下文变化、重新加载或卸载会取消旧任务。
多个请求属于同一事务时在回调内 await/Promise.all，公共层只等待该回调返回的 Promise，
不推测未 await 的异步工作已经结束。

`state.changing` 为 true 时仍可继续输入，但不能保存；异常显示 `state.changeError`，
可点公共重试按钮或调用 `actions.retryChange()`。下一次修改使旧错误及重试上下文失效。
仅当前有效事务可回填；副作用和网络请求仍需要业务透传 signal。
表单 controller 的保存守卫同样检查未完成/失败事务，不依赖按钮禁用。

自定义输入例子：

```vue
<template #field-remark="{ value, update, commit, readonly }">
  <el-input
    :model-value="value"
    :disabled="readonly"
    @update:model-value="update"
    @change="commit"
  />
</template>
```

模板按钮等一次性操作，先 update(value) 再 commit()。直接使用 MyForm 时对应
`setValue/commit` 插槽与可选 `change` 回调；实际客户备注、简称和地区示例见
[客户演示](./customer-example.md#四个页面的可操作示例)。

### 初始化与查询顺序

- 新增：初始模型 → beforeOpen 准备 → 合并 defaults → 草稿决定 → afterOpen。
- 编辑：beforeOpen 准备辅助状态 → 原 load → toModel 回显 → 草稿决定 → afterOpen。
- 详情：beforeOpen → 原 load → toModel → afterOpen → 发布 ready 数据。
- 列表：toQuery → beforeQuery 守卫 → 原 request → 校验行键 → afterQuery → 发布结果。

beforeOpen 可省略，新增可返回 `{ defaults, state }`，编辑/详情只允许 `{ state }`。
afterOpen 指本次 open/load 数据准备完成，不保证 DOM 完成布局；
刷新和手动重新打开会再次执行，KeepAlive 激活本身不会重复打开表单。
有待处理草稿时，等待恢复/丢弃后再执行 afterOpen。
异步子表尚未登记时，childrenReady 为 false，暂不允许保存/恢复，候选草稿保留；
子表准备完成后恢复按钮可用，不会把加载延迟误判为草稿结构冲突。
准备失败进入原加载错误态并可重试；取消、卸载或旧请求结果不发布。

### 保存与关闭顺序

子表完成编辑草稿 → 字段/子表/公共及页面 validate → 公共与页面 beforeSave →
DTO 白名单转换 → create/update → resolveSaved →
公共与页面 afterSave → navigation.saved。

- validate 的 `{ valid:false, issues }` 阻止保存；空 issues 的 false 也不能视为成功。
- beforeSave/beforeClose 返回 `{ proceed:false, reason }` 中止；公共拒绝后不执行页面对应钩子。
- afterSave 失败保留“已保存”事实，提示后续处理失败，不自动重复提交。
- beforeClose 是额外业务检查；原提交锁、脏状态确认、草稿和标签导航保护仍生效。
- 未声明的钩子不增加空操作或无用快照；过期请求继续由原请求通道处理。

悬停合同见 [crud-view.ts](../src/components/business/crud/crud-view.ts) 与继承的 [生命周期合同](../src/components/business/crud/crud-page.ts)。
下文保留低层直接装配用法。

## 1. 建立 API 与查询合同

新标准模块的查询入口、关键词与默认操作符从 fields 派生，见 [模块规范 `3.4](./business-module-standard.md#34-一套字段按场景派生)。下例解释兼容的显式 schema 接法，不要求 customer 再维护 API 查询字段。

先在 `src/api/<领域>/<模块>/` 定义服务端合同。以任务费用为例：

- `types.ts` 声明 `FeeItem`、`FeeSavePayload`、`FeeSaveResult`、`FeeSearchRequest`；金额和日期仍是服务端字符串。
- `query.ts` 定义 `feeQuerySchema`、允许排序字段和 `toFeeSearchRequest`。
- `index.ts` 封装 URL、请求方法、取消信号和响应类型，页面只调用 `FeeAPI`。

查询 UI 产生的是带 AST 的 `CrudListRequest`，必须显式适配成后端接受的 DTO。当前真实写法是：

```ts
// src/api/task/fee/query.ts
export function toFeeSearchRequest(
  query: QueryPageRequest<typeof feeQuerySchema, FeeQueryScope>
): FeeSearchRequest {
  const parsed = parseQueryWhere(feeQuerySchema, query.where);
  if (!parsed.valid) throw new Error(parsed.issues.map((issue) => issue.message).join("；"));
  return { ...query, where: parsed.where, sort: checkQuerySort(query.sort, feeSortKeys) };
}
```

`schema` 只声明真实端点支持的字段、入口和运算符。`0`、`false`、完整日期区间、多选 ID 和空值运算符由查询核心保留；API 适配仍需拒绝非法字段、运算符和排序键。后端只接受平面参数时，在 `toQuery` 或 API `query.ts` 明确把 AST 转成该 DTO，不让 Mock 外观代替实际适配。

API 请求把取消信号传给现有 request 实例，并让装配层显示局部错误：

```ts
search(data: FeeSearchRequest, signal?: AbortSignal) {
  return request<unknown, PageResult<FeeItem>>({
    url: `${BASE_URL}/search`,
    method: "post",
    data,
    signal,
    errorPresentation: "local",
  });
}
```

## 2. 用一个 config.ts 组合模块

`defineCrudConfig` 保留 Row、Entity、Model、ID、查询 schema、固定 Scope、查询 DTO、创建 DTO、更新 DTO、保存回执和页面 Context 的关系。任务费用的实际类型头如下，配置正文见 `src/pages/task/fee/config.ts`：

```ts
export function createFeeCrud(navigation: CrudNavigation<string>) {
  return defineCrudConfig<
    FeeItem,
    FeeItem,
    FeeFormModel,
    string,
    typeof feeQuerySchema,
    { organizationId: string },
    FeeSearchRequest,
    FeeSavePayload,
    FeeUpdatePayload,
    FeeSaveResult,
    FeePageContext
  >({
    key: "task-fee",
    list: {
      /* 列表配置 */
    },
    form: {
      /* 表单配置 */
    },
    navigation,
  });
}
```

主配置小就保留一个文件，主字段较多时拆 `fields.config.ts`。业务子表不受主配置大小影响，每个子表都建立独立 `children/<子模块>/config.ts`，再由父 config 汇总。各所有者的导入边界见模块规范，子组件读取自己的同级 config，不反向导入父装配配置。

`defineCrudConfig` 会检查模块 key、必需函数、重复字段/列/动作/分区/页签以及默认页大小。`list`、`form`、`detail` 和 `navigation` 都是可选能力；简单列表只声明 `list` 即可。

## 3. 列表、固定范围和导航

列表配置负责稳定键、列、查询、范围、API 映射、选择和动作：

```ts
list: {
  getKey: (row) => row.id,
  fields: feeListFields,
  columns: [
    { key: "billCode", label: "单据编号", width: 145, sortable: true, link: "detail" },
    { key: "amount", label: "预算金额（元）", width: 135, align: "right", sortable: true },
  ],
  query: { schema: feeListSchema, initial: emptyAppliedQuery<typeof feeQuerySchema>() },
  scope: (context) => ({
    key: `${context.scopeKey}:task-fee`,
    value: { organizationId: context.organizationId },
  }),
  toQuery: (request) =>
    toFeeSearchRequest({ ...request, sort: checkQuerySort(request.sort, feeSortKeys) }),
  request: (query, request) => FeeAPI.search(query, request.signal),
  pageSize: 20,
  initialSort: { key: "createdTime", order: "desc" },
  selection: "multiple",
  actions: feeListActions(),
}
```

`scope.value` 是服务端必须接收的固定范围，用户查询不能覆盖它；`scope.key` 要随用户、组织和权限版本变化。当前业务页用 `createAccessScopeKey(module, organization, user, permissions)` 生成短稳定键。它只隔离前端请求、参照缓存与偏好，服务端仍从登录会话重建数据权限。

列表页面只建立上下文、导航和 controller：

```vue
<template>
  <div class="page-container">
    <MyCrudList
      :config="config.list!"
      :controller="list"
      :context="context"
      :navigation="navigation"
      :scope-key="context.scopeKey"
      :preference="{
        user: String(user.userInfo.userId ?? 'session'),
        module: config.key,
        version: '2',
      }"
    />
  </div>
</template>

<script setup lang="ts">
const navigation: CrudNavigation<string> = {
  add: async () => {
    await router.push("/task/fee/add");
  },
  edit: async (id) => {
    await router.push(`/task/fee/edit/${encodeURIComponent(id)}`);
  },
  detail: async (id) => {
    await router.push(`/task/fee/detail/${encodeURIComponent(id)}`);
  },
};
const config = createFeeCrud(navigation);
const list = useCrudList(config.list!, () => context.value, { invalidationKey: config.key });
</script>
```

这里省略了任务费用页面的 imports、用户 store 和 `context` 计算属性，完整代码见 `src/pages/task/fee/index.vue`。`useCrudList` 挂载时自动首次读取；页面不要再调用一次初始化查询。它统一管理查询草稿、已应用条件、竞态取消、分页、排序、当前页选择、末页回退和动作状态。

已开启 KeepAlive 的列表切回标签时默认直接恢复已有内容，不自动请求。保存页通过 `useCrudForm` 的 `invalidateViewKey: config.key` 标记所属列表失效，列表则以第三个参数 `{ invalidationKey: config.key }` 在下一次恢复时刷新。列表内写动作仍使用自身的 `refresh` 配置立即刷新；不要再在列表页添加无条件 `onActivated(refresh)`。独立页面沿用 `invalidateView(key)` 与 `viewInvalidationRevision(key)` 的同一约定。

失效版本在当前刷新成功后才确认；失败保留版本差异，下次激活重试。请求期间出现的新失效不会被旧响应确认。`useCrudView` 的详情也复用模块失效标记：保存后重新激活时读取自身记录，普通标签切换不请求。完整路径隔离的详情和编辑实例应在创建时固定实体 ID，不能让后台缓存页监听全局 `route.params.id`，否则切换到另一实体会触发后台重复请求并覆盖原页面内容。

列设置复用 `MyDialog` 与 `useCrudColumns`。真实表头预览、分区/分组栏目轨道和当前设置面板共用一份草稿；显隐、固定位置、顺序、列宽、对齐和密度只有保存后才按用户、模块和配置版本整体写入本机存储，取消不会污染当前列表。表头预览支持点击普通列、分组标题或分组叶子定位对应设置；拖拽以未分组列或整个分组为单位，可在左侧固定、普通、右侧固定区域内及跨区域快速排序。搜索或显隐筛选时暂停排序，避免局部结果与真实顺序混淆。下方结构列表和设置面板使用可折叠的 `el-splitter`，默认弱化结构浏览区并允许用户调整宽度。表头直接拖动列宽仍即时保存。历史偏好没有 `fixed`、`align` 或 `groupAlign` 时沿用源码列定义，损坏宽度、未知字段、非法对齐和全部隐藏继续安全回退。业务列可选声明 `headerGroup: { key, label, align?, fixed? }` 形成两层表头，`align` 控制分组标题默认对齐，`fixed` 控制整组默认固定区域；弹窗按固定区域呈现层级，支持整组显隐/恢复、标题对齐和固定位置。同组叶子列可独立显隐、设置宽度和内容对齐，但不显示拖拽入口，组内顺序始终服从源码配置；分组本身不可拆，只能整体排序或切换固定区域，`useCrudColumns` 会在读取和应用偏好时收拢旧的碎片状态。未声明的模块保持单层表头。

系统选择列与操作列分别构成最左和最右边界，不进入偏好排序；左、右固定业务列始终排列在系统边界列内侧。TableView 将系统边界列与业务表头放入同一个显式渲染序列，避免条件节点与分组组件的挂载时序改变 VXE 的最终列顺序。

简单列表使用同一段结构，只给 `defineCrudConfig` 提供 `key/list`，并省略不存在的导航、选择和动作。若只需静态展示或特殊树表且不需要这些状态，可使用 `MyTable` 或 `TableView`。

### 页面意图与新增引导

跨页面业务入口使用 `useBusinessNavigation().open({ target, action, id? })`，不拼接任意 URL。
目标元信息集中在 `router/business-targets.ts`，模块 `page.basePath` 可复用目标 list。
create 直接打开新增，view 打开详情或列表，按统一展示策略处理（见第 6 节）；不自动提交业务数据。
下面的列表意图与光圈保留给旧链接和显式列表引导入口，新参照流程不绕经列表。
守卫在动态路由生成后校验并移除 `__navTarget/__navAction/__navToken`，保留其他业务 query。
页面、标签及 KeepAlive 只看到规范 fullPath，草稿身份不增加随机参数。
意图邮箱只存短期导航元信息，最多 16 条、5 分钟懒过期、token 一次消费；退出账号清空，不落盘。
外部链接可携带合法意图，但没有内存来源就不显示“返回来源”。

已知目标缺少可访问动态路由时进入 401 显示“无权查看”；未知路径仍按原 404 流程。
目标列表可访问但 `form.permissions.create` 不允许时，不显示新增按钮，使用内联 status 说明：
“当前账号没有新增该单据的权限，请联系管理员授权，或联系对应人员新增。”不要求确认。
新增入口和直接 add 路由也检查同一权限；正式数据/动作权限仍由后端鉴权，Mock 不能证明授权安全。
`useCrudView`/`useCrudPage` 会生成 `createPermitted` 绑定；独立 MyCrudList 需由页面传入，省略沿用旧行为。

`page.guideMode` 默认为 `halo`，可选 `spotlight` 或 false。客户示例使用 spotlight。
`PageActionGuide` 只在有可执行 create 意图时挂载，定位新增按钮的自有 wrapper ref。
光圈采用 CSS 伪元素 opacity/transform 动画（900ms、3 次），spotlight 使用 SVG mask 镂空；
不使用 Canvas、不引入动画依赖、不修改业务按钮样式。遮罩 pointer-events:none，不抢焦点、不锁操作。
窗口 resize、滚动和目标 ResizeObserver 经一次 rAF 合并测量；无意图时没有这些监听或动画循环。
支持减少动态效果，鼠标操作/主要键盘操作结束引导，最迟 5 秒清理，离页释放监听和定时器。
权限不足、列表忙碌或目标不存在时不会高亮不可用操作。轻提示和返回来源入口独立于光圈保留。

### 紧凑列表工具栏

MyCrudList 默认单行：新增、更多操作、短快捷搜索；筛选与刷新、列设置在右侧成组。
快捷搜索默认最多 280px，窄屏按组换行。普通/高级查询弹窗的“重置查询”只恢复本入口默认输入，
不影响其他入口且不立即请求；点击“应用查询”生效，取消仍回到已应用条件。
单个文本快捷字段将查询图标放进输入框，回车仍只提交 quick 条件；多个字段或自定义输入保留成组查询按钮。
普通/高级查询、已应用条件计数、条件删除与重置集中在筛选面板，不常驻第二行。
独立 QueryPanel 默认沿用展开布局，需要紧凑呈现时传 compact，参照弹窗不被强制改变。

toolbar-left 历史插槽名保留，但内容现位于“更多操作”面板；使用图标配合文字按钮。
已有工具栏动作与 MyBatchActions 一同收纳，权限与禁用原因仍由原控制器决定。
选中后入口显示“已选 N 项 · 操作”，面板提供清空选择；未选时批量范围明确说明当前查询全部。
toolbar-right 保留给必要常驻工具；不要再追加多排低频按钮。刷新/列设置使用带无障碍名称和悬浮说明的图标按钮。
窄屏优先缩短搜索区，极窄屏按组换行；不缩小表格字体或行高换取空间。

## 4. 选项、字典和参照字段

表单/列表字段由 `defineFields<Model, Context>()` 建模。固定选项使用 `type: "select"` 与有类型的 `options`；字典使用 `type: "dict"`，同时声明 `dict.valueType` 和与模型一致的 `emptyValue`。

参照使用 `createReferenceField<Model, Context>()`，source 来自业务 API，filters 和 scopeKey 随上下文/模型计算。任务费用药品字段的实际写法是：

```ts
{
  key: "inventoryId",
  label: "药品",
  type: "reference",
  form: { required: true, group: "费用内容" },
  detail: { group: "费用内容" },
  reference: createReferenceField<FeeFormModel, FeePageContext>()({
    source: inventoryReference,
    filters: ({ model, context }) => ({
      organizationId: context.organizationId,
      ownerPartyId: model.principalPartyId,
    }),
    scopeKey: ({ model, context }) =>
      `${context.scopeKey}:inventory:${model.principalPartyId ?? "none"}`,
    beforeOpen: ({ model }) => ({
      allowed: !!model.principalPartyId,
      reason: model.principalPartyId ? undefined : "请先选择委托方",
    }),
    map: ({ items }) => ({
      businessName: items[0]?.businessName ?? "",
      factoryName: items[0]?.factoryName ?? "",
    }),
  }),
}
```

依赖清空用 `FieldLink` 显式声明 `watch/writes/clear/apply`。参照 `map` 只处理该次 typed commit 的业务回填；名称 resolve 不触发业务写入。保存前 `MyForm` 会验证参照，不能用显示名称已出现代替有效性验证。

自动 fields 模式在 scenes.query.input 使用 `createQueryReference`；旧 schema 模式通过 `withQueryInputs` 增加输入呈现。两种方式都不让 source 覆盖固定 scope。完整例子见客户、任务费用 `config.ts`。

### 字典声明、自动预热与刷新

静态字典只在字段中声明一次，不单独维护预热数组：

```ts
{
  key: "status", label: "状态", type: "dict",
  dict: { code: "customer_status", valueType: "string" },
  emptyValue: "pending",
  scenes: { list: true, detail: true, query: { key: "status" } },
}
```

`emptyValue` 必须符合页面模型，示例的 pending 是客户状态默认值，不是通用空值。
`compileModuleFields` 自动把静态字典配置传给已有 enum 查询字段；不会放宽 API 的值和运算符白名单。
动态字典 code 仍由实际字段计算，不提前枚举模型的所有可能值。

`MyCrudList/MyCrudDetail/MyForm` 内部用 `useFieldDictionaries` 预热。
`useDictionary` 与 Pinia 字典池按“访问范围 + code”合并在途请求，所有行共用一份只读结果。
这只是活跃消费者共享，不写 localStorage/IndexedDB，不做长期缓存：
查询/刷新列表会重新获取；KeepAlive 停用或组件卸载释放租约，最后一个消费者释放即清除并取消请求。
仍有其他活跃消费者时保留其正在使用的数据。数据库维护不会实时推送到页面，刷新即可重新查询。

失败保留明确提示与重试入口，未识别的值显示原值，不能悄悄当成正常空值。
自定义组织上下文应提供稳定 `scopeKey`；独立控件未提供范围时使用 application。
统一传输入口是 `src/api/system/dict/index.ts`，以后换真实接口改此适配，不在每行发请求。

## 5. 动作生命周期

工具栏、行和详情动作都使用 `CrudAction`。以下是任务费用批量审核的实际结构：

```ts
{
  key: "approve-selected",
  label: "批量审核",
  location: "toolbar",
  permission: "task:fee:approve",
  disabledReason: ({ selectedRows }) =>
    selectedReason(selectedRows, "draft", "请选择要审核的单据"),
  confirm: ({ selectedKeys }) => ({
    title: "批量审核",
    message: `确定审核选中的 ${selectedKeys.length} 张任务费用单据吗？`,
  }),
  execute: async ({ selectedKeys, signal }) => {
    const result = await FeeAPI.approve({ ids: [...selectedKeys] }, signal);
    return { affectedKeys: result.affectedIds, message: "任务费用已审核" };
  },
}
```

执行器按顺序检查 permission、visible、disabledReason，弹确认，再用最新快照复查并单飞执行。`execute` 必须返回实际成功的 `affectedKeys`；部分失败通过 `failed` 明示。成功默认刷新当前页，也可用 `refresh: "first-page" | "none"`。详情删除可在 `afterExecute` 中调用 `navigation.close()`；写入已经完成，后置失败只能单独提示，不能把动作当作未提交重做。

权限数组要求全部满足。按钮隐藏和禁用原因只是前端体验，API 必须再次检查权限、状态、版本和范围。

列表行索引、只读行快照与所选行由 controller 按数据变化计算并复用；`getKey`、`visible` 和 `disabledReason` 应为纯函数，不在按钮渲染时复制整页数据或发请求。写动作仍在执行前重新检查权限与当前状态。

### index 级批量操作

具体动作规则归 `index.vue`，不放模块 config。config 只维护后端身份：

```ts
// 模块 config.ts 的片段
meta: { key: "customer", componentKey: "customer", /* 其他元信息 */ },
batch: { field: "batchID" }, // 默认使用列表 getKey
// 编码接口改成：batch: { field: "batchCode", getValue: row => row.customerCode }
```

页面复用公共控制器与 MyCrudList 的携带项：

```ts
const batchLock = ref(false);
const list = useCrudList(config.list, () => context.value, {
  invalidationKey: config.key,
  disabled: () => batchLock.value,
});
const batch = useBatchActions({
  module: customerModule,
  config: config.list,
  list,
  context: () => context.value,
  lock: batchLock,
  request: executeBatch,
  commands: [
    { key: "disable", label: "批量禁用", permission: "base:customer:disable", allowQuery: true },
  ],
});
```

```vue
<MyCrudList :config="config.list" :controller="list" :batch="batch" />
```

以上为批量相关片段，页面其余 context/navigation/preference 绑定照常保留。
自定义插槽按钮同时读取 `batch.busy` 禁用，避免批量期间触发另一项写操作。

- 勾选时仅提交选中标识；默认 batchID，batchCode 必须给 getValue，保留数字 0，不拼逗号字符串。
- 不勾选默认禁用；命令显式 `allowQuery: true` 才提交**已应用查询 + 固定范围**，包含全部分页，不读取未提交的查询草稿。
- 公共接口 `src/api/common/batch.ts` 负责 wire 格式；`toBatchBody` 将选择映射为 batchID/batchCode 数组。query 模式后端必须忽略分页并重新鉴权、过滤、校验。
- 确认框展示范围；确认期间范围/选择改变即取消提交。一次请求处理整个批次，不循环逐行请求。
- 统一回执包含 requestId、matched、succeeded、failed、failures；结果可再次打开，前端最多保留 50 条失败样本。
- 部分失败仍刷新列表；网络异常或回执不合法标记“结果待核实”，本实例禁止再次写入，不自动重试。requestId 只用于关联，不代表真实服务端已实现幂等。
- 全量查询以服务端执行时匹配集合为准，不是数据库快照；要求快照/异步任务的业务须由后端扩展合同。

## 6. 新增、编辑与整单保存

可选本机草稿通过 `form.draft` 开启，主、子字段各自声明白名单，宿主提供身份与实例键；恢复、降级、提交保护和列偏好远端适配见 [用户数据存储指南](./user-data-guide.md)。未开启模块保持原有行为。
新模块默认在 `add.vue`、`edit.vue` 各自装配 `MyCrudForm/useCrudForm`，复用字段、子配置和转换函数，不额外增加 Create/Edit 转发层。下文以现有共用宿主展示控制器接法；独立页面使用相同公共合同并各自创建控制器、传入新增或编辑目标。共用宿主的选用与状态隔离以 [模块规范](./business-module-standard.md) 第 3.2 节为准。

表单配置声明权限、字段、可选子模块、初始模型、读取/转换、业务校验、写入与回填：

```ts
form: {
  permissions: { create: "task:fee:create", update: "task:fee:update" },
  fields: feeFormFields,
  createInitial: createInitialFeeForm,
  load: (id, request) => FeeAPI.getDetail(id, request.signal),
  toModel: toFeeForm,
  readonlyReason: (model) =>
    model.status === "approved" ? "已审核任务费用需先弃审再编辑" : undefined,
  validate: async (input) => {
    const issues: CrudIssue<FeeFormModel>[] = [];
    try {
      if (toDecimal(input.model.amount || "0").lessThanOrEqualTo(0))
        issues.push({ field: "amount", message: "预算金额必须大于 0" });
    } catch {
      issues.push({ field: "amount", message: "预算金额格式不正确" });
    }
    return issues.length ? { valid: false, issues } : { valid: true };
  },
  toCreate: payload,
  toUpdate: (input) => ({ ...payload(input), version: input.baseline.version }),
  create: (value, request) => FeeAPI.create(value, request.signal),
  update: (id, value, request) => FeeAPI.update(id, value, request.signal),
  classifySaveError: classifyRequestSaveError,
  resolveSaved: (receipt, input) => FeeAPI.getDetail(receipt.id, input.signal),
  getKey: (record) => record.id,
}
```

上例省略了 imports，其余来自当前费用配置。`toCreate/toUpdate` 必须显式选取 DTO 白名单，不能把 clientKey、显示名称或页面辅助字段整体透传。

`resolveSaved` 处理两类真实后端回执：客户 Mock 直接返回完整 `CustomerRecord`，所以直接回填；任务费用只返回 `FeeSaveResult`，所以按回执 ID 再读详情。新增/编辑宿主创建 controller 后，始终通过 `open` 加载目标：

```ts
const controller = useCrudForm(config.form!, {
  context: () => context.value,
  navigation,
  initialTarget: target(props.id),
  invalidateViewKey: config.key,
});

onMounted(async () => {
  mounted = true;
  await controller.open(target(props.id));
});
watch(
  () => props.id,
  async (value, previous) => {
    if (mounted && value !== previous) await controller.open(target(value));
  }
);
```

`initialTarget` 让编辑深链首屏直接进入 loading。`controller.open` 负责 ID 切换和离开守卫；`controller.close` 负责取消；不要用 watch 直接覆盖 model。`MyCrudFormFields` 登记主表验证端口；`useCrudForm` 创建时统一登记离开保护，标准外壳和定制布局均复用同一保存、回填及关闭流程，页面不维护另一套 loading/dirty/saving。新增、编辑和详情路由应声明 `meta.keepAlive: true`：切换标签时保留草稿、明细编辑状态与滚动位置，不重复弹出未保存确认；关闭标签、刷新标签或页面不再缓存时才执行离开确认并销毁状态。

`useCrudForm` 按实例创建时的完整路径注册公开离开守卫，后台标签也参与关闭与刷新确认。标签栏先确认所有待关闭页面，再移除缓存；批量关闭被拒绝时撤回先前的临时许可。确认、缓存删除和导航完成由同一个标签操作锁串行保护，连续点击不会重复确认或重复删除。独立编辑页应通过 `tagsViewStore.registerLeaveGuard` 接入并在卸载时注销。同路径查询参数变化会替换缓存实例，未保存编辑页仍需确认。退出登录清空整个标签会话；不按隐式数量上限驱逐未保存草稿。

表单工具栏的“关闭”与标签关闭复用同一离开守卫及缓存释放流程；标准路由页关闭后返回列表，再次新增会创建新实例，字段校验错误和辅助 state 不沿用。仅切换标签仍保留现场。选择“保留草稿并离开”只保留本机草稿，下次需明确恢复，不自动填入；选择“丢弃草稿并离开”则删除该实例草稿。

`MyCrudForm` 的 `header` 插槽位于卡片内、主字段之前，并随正文滚动；适合条件校验开关、准备状态和业务说明。`footer` 用于底部核对项，`field-*`/`section-*` 用于字段和子表扩展，均无需业务页额外 CSS。表单正文承担滚动，工具栏与底部核对区保留在卡片内；定位子元素也以正文为边界，避免外层产生空白滚动。

控制器通过只读的 `state.hydrationRevision` 区分整体回填和运行期修改；`MyCrudForm` 自动把它纳入 `MyForm.formKey`。初次读取、同 ID 重载、保存回填和草稿恢复均不执行字段联动或用户 `change`，避免载入省市区时误清下级；普通 `patch` 仍执行配置的同步联动。页面无需维护此版本。

保存顺序已经固定：提交活动子草稿、等待受控回写、锁定输入、主表/子模块/业务校验、beforeSave、DTO 转换、create/update、标记已提交、resolveSaved、建立新基线、afterSave、navigation.saved。

失败含义必须保持：

| 状态                      | 含义                       | 后续动作                                   |
| ------------------------- | -------------------------- | ------------------------------------------ |
| 校验失败或明确 `rejected` | 服务端确认没有接受写入     | 保留输入，修正后重新保存                   |
| `unknown`                 | 网络中断等导致提交结果未知 | 禁止重复写入，先向后端核实                 |
| `committed-needs-sync`    | 写入已提交，详情回填失败   | 只调用 `retrySync()`，不重发 create/update |

只有业务适配能确认服务端拒绝提交时，`classifySaveError` 才返回 `rejected`。
`classifyRequestSaveError` 从 `@/utils/request-error` 导入，仅对明确的业务/权限拒绝返回
`rejected`；网络、服务端异常及无法识别的异常保守地返回 `unknown`。正式后端仍需确认错误码、
幂等键或提交查询协议，前端分类不代表已完成真实事务保障。

### 统一反馈与下一步操作

统一规则位于 [`src/config/feedback.ts`](../src/config/feedback.ts)：成功持续时间、提示位置、
长文本摘要阈值及通用状态文案在此修改。它不保存表单状态，不替代控制器的保存状态机。

`App` 只挂载一个 `FeedbackHost`，轻提示和页内提示都实际渲染 `MyFeedback`，不再转调
`ElMessage/ElNotification`。轻提示位于视口顶部居中，使用紧凑的中性底色、状态图标和关闭按钮；
页内提示使用相同视觉语言，保留安全的下一步操作。浮动提示不遮挡其他区域点击，也不抢焦点。
默认最多 4 条，超出上限释放最早一条；长文不自动消失，重要业务错误仍须保留在当前页。
鼠标悬停或键盘焦点停留时暂停关闭，全部离开后按剩余时间继续；销毁宿主时清理计时器。
动效是 180ms 的 CSS opacity/translateY 过渡，遵守 `prefers-reduced-motion`，不引入动画依赖。

| 情况                         | 展示方式                                       | 安全的下一步                      |
| ---------------------------- | ---------------------------------------------- | --------------------------------- |
| 保存并回填、业务后置处理成功 | 顶部轻提示一次，页面不再额外显示一条成功 alert | 按原导航返回/关闭容器             |
| 校验或明确业务拒绝           | 当前页内提示，保留输入                         | 修正对应字段后保存                |
| 提交结果未知                 | 当前页持续警告                                 | 核实结果，禁止重复提交            |
| 已提交但回填失败             | 当前页持续警告                                 | “重试回填”只重读，不重发写入      |
| 已保存但后置处理失败         | 当前页警告，不称为保存失败                     | 核对页面或返回列表                |
| 列表/详情动作完成或部分失败  | 当前页结果摘要                                 | 核对未完成项，不重复处理已完成项  |
| 文本过长或行数过多           | 原严重度的摘要 + “查看详情”                    | 用户主动打开 MyDialog，不强制确认 |

模块通过 `views.form.feedback` 覆盖业务成功文案，不在 `afterSave` 手动弹提示：

```ts
views: {
  form: {
    feedback: { saved: "客户资料已保存" }, // false 关闭成功轻提示，错误保护不受影响
    // afterSave 只处理业务副作用；不要再次调用保存，也不要重复弹成功消息。
  },
}
```

轻提示在保存命令完成时触发，不监听 phase、挂载或 KeepAlive 激活；本次保存回执对象作为
操作身份，不使用“相同文案 + 时间窗”跨页面去重。导航失败时撤销该次成功轻提示，
由控制器持有后续错误；旧请求的迟到结果沿用现有请求版本和卸载检查，不创建全局保存状态。
后台 KeepAlive 页完成保存不弹提示、不抢占当前路由；返回时通过工具栏“已保存”查看状态，
不补弹一次旧提示。嵌入容器先完成宿主后置工作再关闭，避免后置失败时表单已销毁而无处提示。

`MyCrudFormFeedback/MyCrudList/MyCrudDetailFeedback` 以及详情导航失败、批量结果面板均复用
`MyFeedback` 展示当前控制器状态；短文本直接显示，长文本只在点击后创建详情窗口。文本始终按
纯文本渲染，不执行 HTML。
草稿恢复、丢弃、删除确认和离开保护保留原来的显式决定流程，不按文字长短自动转成确认框。

普通自定义页面可调用 `feedback.success/error/warning/info("纯文本")`，从
`@/utils/feedback` 导入。当前页可恢复的问题优先使用 `MyFeedback`，动作按钮通过默认插槽
提供；不要把“重试写入”的回调放进全局提示。请求采用 `errorPresentation: "local"` 时，
调用者必须接住并呈现错误；未迁移接口保留全局兜底，会话失效仍由认证入口处理。

当前标准 CRUD、Customer、Sale、费用保存及请求/认证入口已接入；历史系统页面、上传等
直接调用 Element Plus 的独立提示暂不批量替换，后续按模块迁移到同一入口，避免一次改动
所有业务的确认和异常处理语义。

### 新增、编辑、详情的统一展示与跨模块打开

模块 `page.presentation` 统一声明 `tab / dialog / drawer`，`add/edit/detail` 只写特例。
优先级为本次调用覆盖、场景覆盖、模块默认、系统 `tab`。`width` 也按同样顺序继承。
旧的 `page.add/edit` 继续兼容，新模块使用统一声明。

```ts
// pages/base/sale/page.ts：轻量声明，不导入 config、API 或字段。
export const salePage: BusinessPageOptions<"org-a"> = {
  basePath: "/base/sale",
  organizationId: "org-a",
  presentation: {
    mode: "drawer",
    detail: { mode: "tab" },
  },
  components: {
    add: () => import("./add.vue"),
    edit: () => import("./edit.vue"),
    detail: () => import("./detail.vue"),
  },
};
// config.ts 的 page 引用 salePage；business-targets 登记同一声明。
```

轻量 `page.ts` 是为路由/跨模块入口共享声明而拆出；业务字段、权限、API、子表仍由
`config.ts` 汇总。三个 loader 各写一次，菜单路由解析与容器复用它们，不为登记导航加载
目标字段、接口或表单实例。直接访问 add/edit/detail URL 始终呈现正常路由页。

标准 `MyCrudList/MyCrudForm/MyCrudDetail` 都自动挂载一个空闲时不渲染内容的
`MyBusinessPageHost`，即使本模块默认 tab，也能打开其他模块的容器。
定制布局才手动挂载 `bindings.host`，不要与标准组件重复挂载。

```ts
const { openBusiness } = useBusinessOpen();
await openBusiness({ target: "sale", view: "add" });
await openBusiness({ target: "sale", view: "detail", id: "sale-001", mode: "dialog" });
await openBusiness({
  target: "sale",
  view: "add",
  completion: "return-to-source",
  onSaved: async (id) => {
    /* 来源业务验证并回写；不要再次保存目标 */
  },
});
```

`useBusinessOpen` 从标准页面取得宿主；自定义入口需提供 `useBusinessPresentation` 并挂载宿主。
打开入口验证目标路由可达性，目标控制器仍执行原权限与数据校验。
新增直接打开 add，不再先跳列表寻找新增按钮。模块内部 `navigation.add/edit/detail`
也复用同一解析。保存时，嵌入表单关闭容器并刷新来源；普通路由表单按详情展示配置打开：
详情为 tab 时释放原表单标签，详情为容器时在已保存页上呈现，容器结束再释放原表单。

参照导航的路由页保留返回来源通道；保存/取消返回原实例。返回通道只保存在内存，来源
卸载后释放，刷新浏览器后不恢复回调。来源不存在时按普通页面导航处理。
`ReferenceNavigation.createdId` 可显式启用新增后选入：将路由边界字符串 ID 转为参照 ID，
再通过原 `source.resolve`、可选性、`beforeCommit` 校验；省略不自动选入。
客户销售组织参照已接入；组织范围、数据源或当前选择改变后放弃自动回写。

同模块详情切编辑复用所属容器，新组件成功加载后才替换旧页；失败保留原页。
跨模块允许一层补充容器，最多两层；更深打开正常路由页，来源随 KeepAlive 保留。
页面只捕获自身 ID 和实例身份；旧实例迟到的保存/关闭不能操作新实例。
组件下载失败在容器内提供重试；关闭销毁表单实例，组件模块仍由浏览器缓存。

X、遮罩、Escape、表单关闭和标签关闭复用离开守卫，父容器也检查补充容器。
切换缓存标签隐藏容器，返回恢复。返回通道的 `businessSession` 查询参数仅区分运行实例，草稿身份剔除该参数，沿用稳定模块和业务路径，不额外创建存储。同路径后台标签被替换前也经过离开确认。

### 简单档案与分区页面布局

在模块 `page.layout` 显式选择内容布局；不配置时保留原有呈现。
布局与 `page.presentation` 独立，不根据运行期字段显隐切换。

```ts
page: {
  basePath: "/base/sale",
  organizationId: "org-a",
  layout: { preset: "simple", entityLabel: "销售组织" },
  presentation: { mode: "drawer", detail: { mode: "tab" } },
  // components 复用轻量页面声明中的三个 loader。
},
views: {
  // list、form 仍按原合同声明
  detail: {
    summary: { titleField: "name", descriptionFields: ["code"], statusFields: ["active"] },
  },
},
```

- `simple` 用于销售组织等少字段档案：外壳铺满可用宽高，主字段区最大宽度 840px 并居中；默认两列，显式 `page.columns` 优先。正文超高时内部滚动，取消/保存仍可达。
- `structured` 用于客户等主子表：使用可用高度，正文统一滚动；主表区域最大宽度 1200px，子表使用可用宽度。默认三列，可用原字段分组和 span 调整。
- 新预设将普通草稿状态显示在底部；待恢复、冲突、提交待核实、存储错误和仅内存降级仍在正文保留完整反馈与处理入口。客户的开发示例选项默认折叠，展开后仍可操作。
- 新预设均将原保存工具栏移至底部，复用权限、字段事务、草稿、保存和关闭保护；`footer` 核对插槽位于操作按钮之前。标题用 `entityLabel`，省略回退模块名。
- 抽屉/弹窗继续装载同一 add/edit/detail 页面，新布局去掉内层卡片边框和页面底色，不重复显示页面标题；容器宽度由 `presentation.width` 配置决定；抽屉始终单列，弹窗按可用最大高度铺满，正文内部滚动。
- 新预设详情直接展示主资料；无子表时不显示单独“主信息”页签。有子表时在资料下显示子表页签，切换明细保留顶部摘要。
- `views.detail.summary` 仅引用模型字段键，按 title/status/description 顺序去重；只取已启用详情场景的字段，复用 `FieldDisplay`，从正文排除已显示字段。标题空值回退为实体详情。未配置 summary 时保留全部资料。
- `MyDesc appearance="plain"` 使用标签/值网格，并按实际容器宽度响应；默认 `bordered` 保留原描述表。
- 页面没有 `actions` 插槽时，标准详情提供复核权限后的默认编辑入口；提供该插槽的页面继续自行装配编辑和附加动作。

### 定制布局：按需组合相同的表单能力

标准 `MyCrudForm` 内部使用 `MyCrudLayout / MyCrudFormToolbar / MyCrudFormFeedback / MyCrudFormFields`，不维护第二套流程。特殊页面仍只调用一次 `useCrudView`：

```vue
<MyCrudLayout>
  <template #toolbar>
    <MyCrudFormToolbar v-bind="bindings.toolbar" />
  </template>
  <MyCrudFormFeedback v-bind="bindings.feedback" />
  <MyCrudFormFields v-bind="bindings.fields">
    <template #default="{ field }">
      <MyBusinessCard>
        <MyFormField v-bind="field('customerName')" />
        <MyFormField v-bind="field('phone')" />
      </MyBusinessCard>
    </template>
  </MyCrudFormFields>
  <CustomerContacts :binding="contacts" />
</MyCrudLayout>
```

上面仅为布局片段，不是完整 customer 表单；完整字段和两个必需子表的接法见
[定制新增](../src/pages/component-lab/custom-crud/add.vue)、
[定制编辑](../src/pages/component-lab/custom-crud/edit.vue)、
[定制详情](../src/pages/component-lab/custom-crud/detail.vue)。
开发环境在客户列表点击“定制布局示例”，或访问 `/#/component-lab/custom-crud/add`。
示例沿用客户权限、配置及开发 Mock，保存后进入定制详情；关闭返回客户列表，不另建业务菜单或复制模块规则。

- `bindings.form` 用于完整标准外壳；`fields / toolbar / feedback` 用于拆分组件，两种布局不同时挂载主字段区。
- `MyCrudFormFields` 默认自动排版；`default` 插槽中的 `field(key)` 返回同一主表单的字段绑定。`MyFormField` 的默认插槽可替换输入控件，保留标题、帮助、只读和错误区域；通过 `update/commit` 更新并确认。
- 字段 key 和值保留类型关联。一个字段只能呈现一次；未渲染的必填字段仍按配置验证，不以模板是否存在绕过规则。条件布局优先 `v-show`；错误定位依赖字段已挂载且所在区域可见，第一版不自动切换业务页签。
- 加载期间保持字段、子表挂载，用 `v-show` 隐藏，避免丢失草稿端口。自定义子表依旧来自 `bindings.child(key)`。
- 自定义按钮调用 `actions.save()`，显示状态使用 `state.canSave / saveDisabledReason / canClose`；可发起保存不等于已通过校验。不挂工具栏仍保留权限、字段事务、草稿和离开保护。
- 不挂反馈组件时，需要自行呈现 `state.error / issues / changeError` 和 `bindings.feedback.controller.draft`；省略提示不会关闭底层保护。
- 详情使用 `MyCrudDetailToolbar / MyCrudDetailFeedback`；`bindings.description` 未加载时为 undefined，加载后可传给现有 `MyDesc`。也可直接读取 `state.model` 自己展示。
- 公共布局只有滚动和区域样式，没有业务状态；可替换成业务自己的布局。不配置独立分区控制器，不复制主模型。
- 只要字段、不需要 CRUD 的页面继续使用 `MyForm`，它同样支持 `field(key) + MyFormField`；保存和数据读取由该页面负责。

## 7. 主子表注册与错误定位

在表单配置里列出参与整单的字段：

```ts
sections: [
  { key: "contacts", label: "联系人" },
  { key: "addresses", label: "收货地址" },
],
childKeys: ["contacts", "addresses"],
```

编辑宿主使用公开 binding：

```ts
const contacts = useCrudTableChild(controller, "contacts");
const addresses = useCrudTableChild(controller, "addresses");
```

```vue
<MyCrudForm
  :controller="controller"
  :fields="config.form!.fields"
  :sections="config.form!.sections"
  :context="context"
>
  <template #section-contacts><CustomerContacts :binding="contacts" /></template>
  <template #section-addresses><CustomerAddresses :binding="addresses" /></template>
</MyCrudForm>
```

客户子模块内部使用 `MyCrudChildTable`，配置所有者统一提供 key、标题、字段、稳定行键、初始行、编辑呈现、normalize、validate、主要项动作和 DTO 映射。组件只装配配置与 binding，不重复业务规则。组件会提交活动行草稿、校验完整数组并根据 `{ section, rowKey, rowField }` 切页、定位和聚焦首错。

编辑呈现按字段复杂度选择：少量短文本和高频录入使用 `edit-presentation="inline"`；需要集中确认的中等表单使用 `dialog`；字段较多、纵向录入较长或需要保留表格上下文时使用 `drawer`。后两者分别通过 `edit-dialog`、`edit-drawer` 设置标题、宽度和一至三列表单，并与行内模式共用同一行草稿、校验和提交合同。聚合子表不支持跳转新页面，因为父单尚未保存时无法建立独立子记录上下文；新页面新增/编辑由主表 `CrudNavigation.add/edit` 路由负责。行内编辑状态统一放在操作列，编辑行各列从顶部对齐，帮助和错误只向下扩展，不再把各输入框分别垂直居中。错误数量与摘要在表格顶部展示，错误行和字段同步标记；点击摘要会自动切换公共分页、重算动态行高、滚动并聚焦实际编辑器。

子表默认内容高度、164px 最小高度，超过默认 10 行才出现分页。可显式传 `height/min-height/page-size`，但业务模块不得按行数猜测高度或覆盖 VXE 私有 DOM。横向溢出由 TableView 处理，右侧操作列固定且每一列在窄屏均可通过横向滚动访问。

所有 `childKeys` 在保存时都必须已挂载登记。页签懒挂载会造成未登记，应保持必需子模块挂载，或用 `activate` 只控制可见性和定位。非表格子模块通过 `controller.registerChild` 提供 `commitDraft/cancelDraft/validate/focus/setReadonly`，有内部草稿时再提供 `isDirty`。

简单子表可直接把 `MyCrudChildTable` 放入 section，无专属交互时不创建包装组件，但仍必须建立独立 `children/<子模块>/config.ts`。客户联系人与地址的独立配置还承载主要项互斥、DTO 映射和编辑/详情复用。两者当前 `persistence.mode` 均为 `aggregate`；`independent` 和 `by-mode` 只定义语义与联调前置条件，公共运行时尚未实现。

## 8. 详情与公开插槽

详情页通过 `useCrudDetail(config, context)`，在实例创建时捕获路由 ID，再用该实例自己的 ID 调用 `load(id)`；不要让后台缓存实例监听全局路由参数。`MyCrudDetail` 的主信息使用同一字段体系，动作仍走公共执行器；业务页签用 `tab-<key>`。具体代码见 [模块开发实操](./module-development-example.md)。

已实现插槽如下：

| 宿主           | 插槽                 | 用法与真实例子                                           |
| -------------- | -------------------- | -------------------------------------------------------- |
| `MyCrudList`   | `toolbar-left/right` | 任务费用 `toolbar-right` 显示本页 Decimal 合计           |
| `MyCrudList`   | `query-<schemaKey>`  | 自定义某个查询输入，接收 draft 与 `setDraft`             |
| `MyCrudList`   | `column-<rowKey>`    | 特殊业务列；值与行按只读合同提供                         |
| `MyCrudForm`   | `field-<modelKey>`   | 自定义字段，必须通过 `update(value)` 回写                |
| `MyCrudForm`   | `section-<key>`      | 客户联系人、地址子模块                                   |
| `MyCrudForm`   | `footer`             | 追加业务核对区；新布局在底部操作之前，旧布局保留顶部操作 |
| `MyCrudDetail` | `tab-<key>`          | 客户只读联系人、地址页签                                 |
| `MyCrudDetail` | `actions`、`footer`  | 客户/费用详情编辑按钮及自定义尾部                        |

任务费用的已运行插槽只有业务内容，不依赖内部 ref：

```vue
<MyCrudList ...>
  <template #toolbar-right>
    <span class="fee-total">本页合计 {{ pageAmount }}</span>
  </template>
</MyCrudList>
```

动态分区和页签名称在开发模式由 `diagnoseCrudSlots` 检查。插槽接收只读状态与公开命令；不要通过组件实例、DOM 查询或 VXE 私有 API修改装配状态。

## 9. 何时不用装配层

直接组合基础组件适合以下情况：只读仪表盘、复杂树表、画布/地图、动态跨行跨列单元格和虚拟滚动的特殊组合、分步骤多实体事务、独立保存型子表、审批设计器，或布局与列表/表单/详情范式明显不同的页面。标准两层分组表头已由 `headerGroup` 支持，无需退出装配层。此时仍复用适用的 MyReference、字段输入、MyTable、TableView、Pagination、request、日期和 Decimal 工具。

局部差异优先放在模块 `config.ts` 的格式化、guard、validate、adapter、action 或公开插槽中。只有第二个真实模块出现同语义缺口，且能保持既有调用兼容时，才增强公共组件或 composable。不要为了一个页面增加大量布尔 props，不访问私有 refs，也不复制分页、保存、确认、脏状态和常规布局。

兼容边界：旧系统页面、`TableSelect`、`usePageTable` 继续可用；新模块采用本规范。MyReference、MyForm、MyTable 仍可独立使用，升级到 MyCrud 只是把页面通用编排交给已验收的控制器，不改变它们原有公开合同。

## 10. 验证与交付

按改动范围至少覆盖：

1. 查询：快捷/普通/高级、AND/OR、取消、重置、固定范围、0/false、日期和非法输入。
2. 列表：首次读取、分页、排序、选择清理、列偏好、动作确认、末页回退和错误重试。
3. 表单：新增、编辑深链、切换 ID、只读、保存单飞、离开确认和三类失败恢复。
4. 主子表：活动草稿、全量校验、稳定键、删除/主要项规则、跨页首错定位。
5. 页面：菜单、隐藏路由、权限、标签返回、桌面/390px、明暗主题、控制台。

完整测试使用 `pnpm test`；公共合同或页面模型变更运行 `pnpm type-check`，跨模块或构建相关改动运行 `pnpm build`。浏览器验证必须操作实际业务路径。交付时说明实际验证结果、Mock 写入只在开发服务进程内保留以及真实后端尚待联调的协议。

## 开发验收与验证分层

开发环境的隐藏 CRUD 验收页（`/#/component-lab/crud`）复用已有故障开关和标准控制器。
展开“页面打开与返回验收”，选择客户/销售组织和继承配置/标签页/弹窗/抽屉，
打开真实新增、编辑或详情；编辑/详情填写真实记录 ID，例如 Sale 的 `sale-east`，不是编码 `SALE-HD`。
来源输入用于检查返回后状态保留，保存回执计数用于检查是否重复通知。
该来源页启用现有标签缓存，跨页时返回通道与来源输入随页面实例保留；关闭来源标签后释放。
由客户参照进入销售组织新增，还可检查跨模块回写和嵌套容器。

下方慢请求、列表失败、保存拒绝、回填失败和 afterSave 失败开关只作用于验收页自己的 Mock，
不会人为影响客户/销售组织数据源；三种真实页面容器测试和故障测试共用一个入口，但数据范围不同。
该入口仍仅在开发环境提供，不在生产注册。

日常运行 `pnpm test:quick` 获取行为与结构反馈；涉及类型合同运行 `pnpm test:contracts`，
包含正向/反向类型用例、TS 悬停及含编译断言的混合测试。`pnpm test` 保留全部测试，
两组分区自检防止漏测、重叠或新编译用例混入快组。分组实现和命令说明统一见
[README](../README.md#快速开始)。命名查询方案的配置、失效和存储规则见
[用户数据指南](./user-data-guide.md#命名查询方案)。
