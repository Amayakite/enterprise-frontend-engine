# 文档导航：按任务读取

入口分工：根 [README](../README.md) 讲启动；[AGENTS](../AGENTS.md) 是 AI/开发者速查卡；本页只负责找文档。详细文档不要求每次全部阅读。

## 30 秒定位

| 当前任务                          | 阅读范围                                                                                              | 首查源码                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 新建/重构业务模块                 | [模块规范](./business-module-standard.md)；[实操](./module-development-example.md)；CRUD 对应能力章节 | `src/pages/base/customer/`、目标 API                                                  |
| 调整主子表                        | 模块规范 §2、§3；实操 §3–6；[CRUD](./crud-development-guide.md) §6–7                                  | `config.ts` 内的 children、`children/*/config.ts`、`crud/module.ts`                   |
| 新增/修改页面与保存               | 模块规范 §3.2；CRUD §6；实操 §6–7                                                                     | 目标 `add.vue/edit.vue/config.ts`、`useCrudForm`                                      |
| 列表、查询、权限动作              | CRUD §1–5                                                                                             | 目标 API `query.ts`、`config.ts`、`useCrudList`                                       |
| 文本/金额/日期/地区/参照/弹窗     | [组件指南](./business-components-guide.md) 对应标题                                                   | `components/business/fields/`、对应组件和相邻 types                                   |
| 字典预热、批量操作、弹窗/抽屉编辑 | [CRUD 指南](./crud-development-guide.md) §4–6                                                         | `useFieldDictionaries/useBatchActions/useBusinessPage`、`crud/MyBusinessPageHost.vue` |
| API、DTO、类型或文件归属          | [类型规范](./typescript-and-structure.md)；模块规范 §4                                                | 目标 `src/api/`、页面 `types.ts/adapters.ts`                                          |
| KeepAlive、切页慢、重复加载       | CRUD §3、§6；目标页面生命周期                                                                         | `useCrudList/useCrudForm`、`pages/layout/`、`stores/tags-view.ts`                     |
| 成功/失败提示、错误归属与下一步   | [CRUD 统一反馈](./crud-development-guide.md#统一反馈与下一步操作)                                     | `config/feedback.ts`、`utils/feedback.ts`、`business/feedback/MyFeedback.vue`         |
| 草稿、列偏好、存储与后端同步      | [用户数据指南](./user-data-guide.md)                                                                  | `utils/user-data/`、`useCrudDraft/useCrudColumns`                                     |
| 查看现有业务参考                  | [客户示例](./customer-example.md)；仅需要局部能力时看[费用示例](./task-fee-example.md)                | 对应模块及其调用点                                                                    |
| 删除/替换服务申请或会议申请       | [试点边界](./production-pilots/README.md)                                                             | 目标页面、API、Mock、菜单引用                                                         |

“§”指文档中的编号章节。新模块先完整阅读模块规范；局部任务按表选择相关章节，涉及的合同与限制一起读，不能只复制示例片段。

## 参照导航与最简模块

- [后端接口契约草案](./backend-contract-draft.md)：客户/销售组织当前 DTO、请求示例及联调前待确认事项。
- 命名查询方案见 [用户数据指南](./user-data-guide.md#命名查询方案)；开发验收入口与测试分层见 [CRUD 指南](./crud-development-guide.md#开发验收与验证分层)。

- [Sale 最简标准模块](./sale-example.md)：无子表四页 CRUD、客户参照跳转配置及开发权限预览入口。

- 参照导航、局部回写见[组件指南](./business-components-guide.md#参照查看与前往新增)；页面意图、CSS 光圈与 SVG 遮罩见 [CRUD 指南](./crud-development-guide.md#页面意图与新增引导)。以当前源码合同为准。

## 最小检索方式

在仓库根目录执行；将路径、关键词替换为本次任务目标：

```powershell
rg --files src/pages/base/customer src/api/base/customer
rg -n '^##' docs/crud-development-guide.md docs/business-components-guide.md
rg -n 'useCrudForm|useCrudTableChild' src/pages/base/customer src/composables
```

先定位文件和标题，再读取目标章节、类型及调用点。不要一次输出全部 docs 或整棵 src；输出截断时缩小范围补读。本次已读且未变化的内容无需重复加载。这里的“速查卡/口袋卡”是普通 Markdown 入口，不依赖插件或额外技能安装。

## 文档所有权

| 文档                                        | 唯一职责                                   |
| ------------------------------------------- | ------------------------------------------ |
| [模块规范](./business-module-standard.md)   | 文件结构、配置归属、主子表边界、开发流程   |
| [模块实操](./module-development-example.md) | 按文件展示接法；标明片段范围，链接当前源码 |
| [CRUD 指南](./crud-development-guide.md)    | 控制器、查询/动作/保存、缓存生命周期、验证 |
| [组件指南](./business-components-guide.md)  | 字段、参照、弹窗、表格公开能力             |
| [类型规范](./typescript-and-structure.md)   | 类型所有权、导入和 DTO/模型边界            |
| [用户数据指南](./user-data-guide.md)        | 存储适配、草稿、列偏好、降级与同步限制     |
| 业务示例、试点边界                          | 当前实现与限制；不另立一套开发规则         |

## 维护规则

- 一项长期规则只在所属主文档维护；速查卡保留必要摘要，其他位置用链接引用。
- 用户当前任务决定做什么；规范决定怎么做。未联调能力、示例和限制清单不等于授权待办。
- 规则描述应如何开发，源码/相邻类型确认已实现能力。发现冲突先核对调用点并同步修正，不盲从历史示例。
- Mock 不等于真实后端；现行文档不保存执行流水、阶段数字和已完成待办。
- 更新合同或文件路径时同步对应主文档，检查格式与相对链接。不要默认在每个模块复制 AGENTS.md；仅有真实局部约束时才新增。
