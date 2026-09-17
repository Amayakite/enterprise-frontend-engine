# Sale：最简销售组织档案

入口：基础资料 → 销售组织档案（`/#/base/sale`）。
这是无子表的标准 CRUD 示例；复杂主子表继续参考 Customer。
当前 API 是开发进程内存 Mock，重启恢复种子，不代表正式权限、持久化或事务已联调。

## 从哪个文件开始

首先打开 [config.ts](../src/pages/base/sale/config.ts)：编码、名称、启用、备注仅维护一套，
主字段直接内联 fields 数组，通过 scenes 派生表单、列表、详情和查询。
没有审核、批量动作、子表或演示钩子。公共接法见 [CRUD 指南](./crud-development-guide.md)。

| 文件                                          | 职责                                                            |
| --------------------------------------------- | --------------------------------------------------------------- |
| `src/pages/base/sale/config.ts`               | 模块身份、页面路径、上下文、API、模型白名单、fields、查询及权限 |
| `src/pages/base/sale/types.ts`                | 显式继承 BusinessModuleContract，API 实体直接作模型，不复制 DTO |
| `index.vue / add.vue / edit.vue / detail.vue` | 各自 useCrudView，只选择 view 并渲染 MyCrud 组件                |
| `src/pages/base/sale/references.ts`           | 复用模块派生查询，装配参照 source；不决定使用页的跳转           |
| `src/api/base/sale/index.ts / types.ts`       | 请求、DTO、取消信号、批量 resolve                               |
| `mock/sale.mock.ts / sale-data.ts`            | 独立查询白名单、范围、必填、编码唯一及版本检查                  |

新增/编辑各自装配，不增加共用 Editor。没有模型转换差异，因此不额外建立 adapters.ts；
config.model 直接写出保存白名单。必须保留 context 与 parseId 适配，不能只写 page.basePath。
页面无需 CSS；当前新增为抽屉，列表已启用 KeepAlive。
index/detail 仅渲染标准 `MyCrudList` / `MyCrudDetail`；它们会自动挂载一次
`MyBusinessPageHost`，后续只改 page.add/edit 即可选择 tab/dialog/drawer。
默认未配置的模式仍为 tab，直接访问 add/edit 路由仍显示完整页面。

## 客户如何参照 Sale

[客户 config](../src/pages/base/customer/config.ts) 的 saleId 字段声明必填、回写与导航：

```ts
reference: reference({
  source: saleReference,
  filters: ({ context }) => ({ organizationId: context.organizationId }),
  scopeKey: ({ context }) => context.scopeKey,
  map: ({ items }) => ({ saleName: items[0]?.name ?? "" }),
  navigation: {
    view: (id) => ({ target: "sale", id }),
    create: "sale",
    createLabel: "前往新增销售组织",
  },
});
```

这是字段片段，不是独立模块。流程是：

1. 新增客户时选择销售组织；保存 DTO 只提交 saleId，saleName 由 Mock 解析返回。
2. 选择后点查看入口进入该组织详情；是否显示入口由 navigation.view 配置决定。
3. 找不到时先改关键词，或通过“筛选”打开普通/高级查询。
4. 点击“前往新增销售组织”进入 Sale 列表，由该页权限决定能否引导新增。
5. 新增后返回来源，重新查询并选择；不自动建单、不自动回填新记录。

目标路径在 [business-targets.ts](../src/router/business-targets.ts) 的 saleTarget 登记，
与 config.page.basePath 共用；菜单和隐藏路由由 Mock 菜单接口提供，不用页面硬编码跳转地址。
普通/高级查询复用 Sale 本身的字段派生结果，不另外声明一份界面 schema。
服务端白名单仍独立验证。停用组织允许历史回显和查看，但不允许重新选择并保存。

## 快速对比新增权限

开发环境的客户新增页顶部，以及 `/#/component-lab/reference` 顶部有“开发权限预览”：

- 正常权限：恢复本次登录的原始权限；默认 Mock 管理员可以新增。
- 无销售组织新增权限：选择此项，再从销售组织参照点击“前往新增销售组织”。
- 无客户新增权限：在实验页客户参照点击“前往新增客户”。

有权限时目标列表高亮新增按钮；无权限时没有新增按钮，只显示无需确认的轻提示。
直接访问受限 add 地址也不渲染可编辑表单。返回来源点击“恢复权限”，或刷新浏览器恢复。
开关仅修改内存中的前端预览，不修改 Mock 用户接口、不持久化，也不能给登录用户增加权限。
权限变化会改变访问范围；已打开表单若提示上下文变化，先按页面提示重新加载，再打开参照。
这里保留原有范围隔离与草稿保护，不为演示绕开它们。
它不模拟真实后端数据权限；生产构建不包含此入口。

## 新模块复制哪些内容

复制 Sale 的职责结构，替换业务模型、API、config 字段与菜单登记即可；
没有参照需求就不建立 references.ts，没有子表就保留空 children。
不要复制客户的省市区、审核或联系人规则。
具体默认合同及扩展边界见[模块规范](./business-module-standard.md)与[CRUD 指南](./crud-development-guide.md)。
