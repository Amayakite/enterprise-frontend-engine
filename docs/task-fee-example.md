# 任务费用示例

入口：开发服务登录后，任务管理 → 任务费用（`/#/task/fee`）。本文记录现有实现，仅作金额、批量动作和保存回执回读等局部能力参考，不作为新模块结构范本。新模块统一参考 [客户管理](./customer-example.md) 和 [模块开发实操](./module-development-example.md)；公共能力合同见 [CRUD 开发指南](./crud-development-guide.md)。

## 目录与职责

```text
src/pages/task/fee/
  index.vue                  MyCrudList 列表入口与本页金额合计
  add.vue / edit.vue         新增、编辑薄路由入口
  detail.vue                 MyCrudDetail 与详情动作
  FeeEditor.vue              新增、编辑共用 MyCrudForm 宿主
  config.ts                  唯一公开配置入口
  fields.config.ts           内部字段定义
  adapters.ts                页面模型、金额和保存 DTO 转换
  references.ts              委托方、服务方、药品 source 绑定
  types.ts                   FeeFormModel、FeePageContext
```

API DTO 与请求位于 `src/api/task/fee/`；查询 schema/AST 适配位于其 `query.ts`；开发处理器位于 `mock/task-fee.mock.ts`。

## 当前行为与复用

- 列表复用 `MyCrudList/useCrudList`，支持三类查询、分页、排序、列设置、当前页选择、批量状态操作与刷新。
- 新增和编辑共享 `FeeEditor.vue` 与 `config.form`。委托方、服务方、药品复用主数据参照；更换委托方时原子清空依赖字段。
- 金额使用 Decimal 校验与格式化，不经 `number`；附件沿用 `FileInfo[]`，状态沿用字典合同。
- `CrudAction` 统一处理权限、可见性、禁用原因、确认、单飞和刷新。保存后按 ID 再读详情；失败保留输入，回填失败只能 `retrySync()`。
- 菜单、隐藏路由和按钮使用 `task:fee:*` 权限；费用金额、附件、依赖回填和业务文案留在费用模块。

当前接口是 `/api/v1/pilot/task-fees` 开发合同，写入只保存在 Mock 进程内存。真实后端仍需联调 URL、数据权限、金额与时区、附件、版本冲突、批量部分失败、事务、取消、幂等及提交状态查询。
