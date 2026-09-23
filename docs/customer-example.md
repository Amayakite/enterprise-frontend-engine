# 客户管理示例

入口：开发服务登录后，基础资料 → 客户管理（`/#/base/customer`）。这是新模块职责划分的主要参考：列表、表单和详情使用 CRUD 组合；联系人与地址各有独立配置。无子表模块沿用主模块结构并精简子表组合。按文件展开的代码见 [模块开发实操](./module-development-example.md)。

## 结构设计

客户是保存的根实体；联系人与收货地址属于客户整单。销售组织是独立档案，客户通过 saleId 引用，
不随客户保存新增或修改销售组织。当前结构是前端模型/API 接口约定，不是已确认的数据库表设计。

```text
销售组织（独立档案） ← saleId — 客户主记录
                                  ├─ contacts[] 联系人
                                  └─ addresses[] 收货地址
```

| 结构              | 设计与来源                                               | 保存边界                                    |
| ----------------- | -------------------------------------------------------- | ------------------------------------------- |
| 主键与编号        | id 为字符串；customerCode 为接口生成的展示编号           | 不从表单上传主键/编号作为可修改字段         |
| 客户资料          | 名称、简称、类型、信用代码、电话、详细地址、备注         | 主 adapter 按白名单转换，必填/格式归 fields |
| saleId / saleName | 编辑未选择时 ID 为 null；名称由参照回显及接口解析        | 提交 ID，名称不作为写入字段                 |
| 地区 ID/名称      | 页面 ID 可空；DTO 为字符串，保存前校验并转换；名称只回显 | 级联清空归主模块，展示名称不写入            |
| contacts          | 联系人数组；id 为稳定行键，primary 表示主要联系人        | 子 config 负责归一化、多行校验和行 DTO      |
| addresses         | 地址数组；id 为稳定行键，primary 表示默认地址            | 子 config 负责默认项、校验和行 DTO          |
| 状态与审计        | 审核、启用、创建人/时间、更新时间来自实体响应            | 不进入普通表单白名单；状态动作走对应 API    |
| version           | 载入记录的版本                                           | 编辑携带基线版本，冲突不能直接覆盖          |

新增和编辑分别生成初值/读取实体，均只发送一次包含两个子数组的整单请求。
空数组正常提交，分页仅改变显示范围；保存校验所有子行。子行编辑草稿由各子组件维护，
提交整单前先完成行编辑；主模型、保存基线和草稿由原控制器协调。
子行 ID 当前沿用 Mock 接口约定，正式后端如何生成 ID、是否采用 clientKey 映射仍需确认。

类型见 [API DTO](../src/api/base/customer/types.ts) 和[页面模型](../src/pages/base/customer/types.ts)；
完整提交字段见 [adapters.ts](../src/pages/base/customer/adapters.ts)，不在此重复维护另一份字段清单。

## 目录与职责

```text
src/pages/base/customer/
  index.vue                  统一列表入口、批量规则与工具栏扩展
  add.vue / edit.vue         各自使用 useCrudView，演示 state/hooks 与字段、分区插槽
  detail.vue                 统一详情入口与显式只读子表页签
  config.ts                  唯一公开 customerModule；fields/links/children 内联且逐段注释
  adapters.ts                页面模型和整单 DTO 转换
  types.ts                   页面模型、上下文及继承公共接口约定的 CustomerContract
  children/types.ts          客户专属的子配置接口约定与定义辅助函数
  children/contacts/config.ts 联系人字段、行键、校验、主要项动作和 DTO 映射
  children/contacts/CustomerContacts.vue 联系人编辑/只读显示组合
  children/addresses/config.ts 地址字段、行键、校验、默认项动作和 DTO 映射
  children/addresses/CustomerAddresses.vue 地址编辑/只读显示组合
```

查询入口与 keyword 参与字段直接写在 config.fields.scenes.query，operators 默认按类型推导（详见模块规范 §3.4）。API DTO、排序和协议适配位于 `src/api/base/customer/`；服务端 Mock 白名单在 `mock/customer-query.ts`，开发数据和处理器位于 `mock/customer-data.ts`、`mock/customer.mock.ts`，页面不引用 Mock schema。

## 主子配置边界

客户 add/edit 各自通过 useCrudView 组合完整表单，模板直接使用 MyCrudForm，不共用 Editor；页面保留场景差异，模型、校验、保存和草稿复用公共配置/控制器。选择规则见 [业务模块开发规范](./business-module-standard.md)。

父 `config.ts` 内联 children 绑定，由公共组合器派生 sections/childKeys、详情 tabs 并汇总子表校验；父 `adapters.ts` 通过 model 工厂注入的同一绑定的 payloadKey/toPayload 组合整单 DTO。子表字段、行编辑参数、主要项规则与提交白名单都在子配置，不搬到父表。子组件读取同级 config，父 adapter 可直接引用子 config，避免反向引用父 config 形成循环。

结构参考不等于照抄全部实现：`defineCustomerChildConfig` 是客户专属而非公共 API；主子表关系则复用公共 defineAggregateBinding，`org-a` 是 Mock 范围，行 ID 和整单保存也受当前 DTO 约束。新模块应按真实接口约定调整；默认主字段和归属直接可见；确实复杂时才按维护收益拆分片。

## 页面配置与扩展

`config.page` 集中提供 basePath、组织来源、列偏好版本、布局列数和 Mock 提示。
`useCrudView(customerModule, { view })` 内部复用 useBusinessPage 组合 context、navigation、preference、draftIdentity；
entityId/instanceKey 只在当前路由实例创建时捕获，不随后台全局路由变化。
导航需要不同目标时通过 options.navigation 覆盖 saved/edit 等方法，默认路径继续复用。

各页解构 `state/actions/bindings`；列表、表单、详情模板分别显式导入 MyCrudList、MyCrudForm、MyCrudDetail。
表单的 contacts/addresses 在 setup 中通过 `bindings.child(key)` 取得原绑定，
详情直接从 `state.model` 读取只读子行；点击 import 可追踪实际组件。
列表和详情组件从 `bindings.list/detail` 自动挂载 MyBusinessPageHost，页面不再重复挂载，
保留 dialog/drawer 打开模式；定制布局接法见 [CRUD 指南](./crud-development-guide.md#新增编辑详情的统一展示与跨模块打开)。

列表的 `toolbar-left` 插槽演示“查看选中客户”：先勾选一行，再打开其详情；
按钮只读公共 selectedKeys，不读取表格私有实例、不额外请求。详情编辑权限也读取 form 配置。

省市区的 `createGeographyReference` 是数据源工厂，不立即请求 API：搜索时调用 search/query，
回显与保存校验时调用 resolve。字段内联 filters/scopeKey/map；传输和数据源列定义仍归 API。
查询参照默认继承 QueryPanel 的范围，无须另造用户隔离 key。

## 四个页面的可操作示例

新增、编辑的额外校验开关、载入状态和字段变化说明放在 `MyCrudForm.header` 插槽内，随表单正文滚动。这些示例使用现有公共控制器和插槽；页面辅助 `state.custom` 不进入 DTO 或草稿，字段修改仍经过插槽 `update`，参与脏状态、校验和草稿。

| 页面源码                                            | 可以实际操作                                                   | 对应扩展点                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [index.vue](../src/pages/base/customer/index.vue)   | 切换完整地区显示；勾选客户后打开摘要或查看详情；查询后观察次数 | `state`、`afterQuery`、`column-cityName`、工具栏和内容插槽                            |
| [add.vue](../src/pages/base/customer/add.vue)       | 选择备注模板；开启联系电话必填；未勾选核对时保存会被拦截       | `beforeOpen`、`afterOpen`、`validate`、`beforeSave`、`field-remark`、`footer`         |
| [edit.vue](../src/pages/base/customer/edit.vue)     | 开启简称必填；用名称填入简称；编辑联系人并观察数量和修改状态   | `afterOpen`、`validate`、`afterSave`、`field-shortName`、`section-contacts`、`footer` |
| [detail.vue](../src/pages/base/customer/detail.vue) | 在联系人页签按姓名或电话筛选；打开客户联系卡片                 | `state`、`afterOpen`、`actions`、`tab-contacts`、`footer`                             |

### 新增与编辑的观察顺序

1. 新增页准备的是本地备注选项，不模拟额外后端接口。默认备注可以修改或清空；恢复草稿时以草稿为准，初始化不会覆盖恢复内容。
2. 开启“本次新增必须填写联系电话”，清空电话并保存，可以观察字段级校验。关闭此开关后仍执行共享配置中的其他规则。
3. 填完公共必填项后，不勾选“我已核对客户资料”保存，可以观察 `beforeSave` 拦截；勾选后继续原保存流程。这是演示用本页开关，重新打开页面或恢复草稿需重新核对，不代表后端审核。
4. 编辑页不使用新增默认值覆盖接口回显。开启简称必填后，可通过字段插槽按钮填入客户名称前 30 字；联系人分区仍使用原来的 `binding`，纳入整单校验和保存。
5. 编辑保存成功会记录返回的客户编号，之后继续默认关闭/返回流程；该辅助信息不保证在离开页面后仍可见，也不用于提交版本。
6. 列表摘要只读取当前选中的已加载行；详情筛选只影响展示，不修改原始联系人或触发保存。查询/读取次数都是当前页面实例的观察值，不是业务统计。

新增、编辑页还启用了 `hooks.change`：确认客户名称、备注、简称或地区后，顶部显示最近调整说明。
文本输入过程中不会逐字触发；备注模板和简称快捷按钮显式 update 后 commit。
选择地区时回调已经能读取 ID、名称和下游同步清空结果。完整时序、异步回填和取消语义见
[字段确认钩子](./crud-development-guide.md#主表字段确认hookschange)。

页面使用公共组件内置样式，没有新增业务 CSS。`tests/customer-page-examples.test.mjs` 编译并挂载实际页面脚本和模板，以组件边界替身验证事件、插槽、钩子和取消行为；它不替代浏览器中真实组件、路由、明暗主题与窄屏的交互检查。

## 字典、批量与打开方式

- 客户类型、状态用字段 dict.code 连接统一字典接口；查询自动继承静态字典声明。活跃页面共享请求，刷新列表重新读取，不持久化字典。
- index 的 `useCrudView` batch 选项声明批量禁用、批量删除；不勾选时可操作全部已应用查询，执行前明确确认范围。删除已审核客户会返回部分失败，便于观察结果明细。
- config 的 `meta.componentKey: "customer"` 供 Mock 识别模块；`batch.field` 默认 batchID，改 batchCode 时同时配置 `getValue: row => row.customerCode`。
- `page.add/edit` 默认 tab；把 mode 改为 drawer 或 dialog 即可试用相应入口。index/detail 已包含弹窗和抽屉容器，保存后刷新当前列表/详情。
- 查看结果、失败原因、请求编号和不确定提交提示均为公共 UI。操作的权限、全量筛选、幂等、持久化仍须真实后端落实。

完整接法与接口约定以 [CRUD 指南](./crud-development-guide.md) 字典、批量与页面显示章节为准。

## 当前行为与复用

- 主表与联系人、地址已按各自配置开启本机草稿；可恢复尚未确认的子行。字段白名单、隐私边界、版本冲突与降级见 [用户数据存储指南](./user-data-guide.md)。这不代表真实后端草稿同步已经接入。
- 列表复用 `MyCrudList/useCrudList`，支持快捷、普通、AND/OR 高级查询、分页、白名单排序、列设置和操作。
- 新增、编辑分别通过 `useCrudView(..., { view: "add"/"edit" })` 取得场景配置与控制器；省、市、区使用依赖参照，切换上级时原子清空下级。
- 联系人与地址各自使用 `MyCrudChildTable`：联系人采用 inline，地址采用 drawer 行编辑。子模块拥有行键、主要/默认项、校验与 DTO 映射；父配置只负责汇总和 `aggregate` 整单保存。
- 保存与详情分别由 `useCrudForm`、`useCrudDetail` 管理；客户业务层只保留地区关系、重复行键、主要联系人、默认地址和 DTO 白名单等规则。
- 详情和编辑的实体 ID 随 `fullPath` 缓存实例在创建时固定；后台 KeepAlive 实例不会跟随当前全局路由切换实体或重复读取。
- 审核、撤销审核、启停和删除与列表共用 `CrudAction`。菜单、隐藏路由和按钮使用 `base:customer:*` 权限。

当前为开发进程内存 Mock。联系人与地址随 `CustomerSavePayload` 整单保存；正式接口的权限、版本、事务、部分失败和持久化语义仍待联调。

## 定制布局参考

开发环境客户列表的“定制布局示例”链接可打开独立的新增、编辑、详情示例。它们复用本模块配置，分别展示自由字段布局、自定义保存按钮和配置描述与自定义摘要混排；实现边界与接入方式见 [CRUD 定制布局](./crud-development-guide.md#定制布局按需组合相同的表单能力)。标准 customer 页面继续作为默认开发参考。
