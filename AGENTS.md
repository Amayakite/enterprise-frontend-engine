# 项目速查卡

适用整个仓库；中文沟通与交付。这里只保留执行摘要，详细规则按任务读取，不批量加载全部文档。

## 先做什么

1. 首次进入读 [README](./README.md) 了解启动与接口边界；按 [文档导航](./docs/README.md) 选择任务文档。
2. 读目标模块、相邻类型和调用点；先用 `rg` 检索现有组件、composables、utils、API 和依赖。
3. 按用户当前需求实现最小改动；规范不是待办，不顺带重写旧模块。示例解释用法，实际合同核对源码。
4. 新能力先复用，再小幅增强；新增重复实现必须说明现有能力缺口。

## 不可偏离

- Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router，使用 pnpm；保持现有中文后台、标签页和明暗主题。
- API 仍为开发 Mock；不能宣称真实持久化、权限、事务或跨端同步完成。Excel 解析、校验和导入执行归后端。
- 新模块参考 customer 的职责划分，不照抄其 Mock 组织或业务规则。默认在 `add.vue/edit.vue` 各自装配，共用 Editor 非必需。
- 主入口 `config.ts`；每个业务子表必须有 `children/<子表>/config.ts`，父配置只汇总。当前子表仅支持 aggregate 整单保存。
- 标准业务复用 `MyCrud* + useCrud*`；普通业务弹窗用 `MyDialog`。不读私有 ref/实例，不用业务 CSS 覆盖 `.el-*`、`:deep()` 或私有 DOM。
- DTO 归 API，页面模型归页面，组件合同归组件；`import type` 显式导入。不用 any/断言掩盖结构错误；ID 保留类型，金额复用 Decimal。
- 简单/示例模块的主 fields、links、children 注册内联 config；子表自身 config 仍独立。模块合同在页面 types.ts 显式继承 BusinessModuleContract。
- business 的全部 TS 合同（含匿名 options、嵌套对象、联合分支、控制器/子表端口）逐字段写 JSDoc；变更运行 `node --test tests/business-docs.test.mjs`，不能只检查 types.ts。
- JSDoc 是交付要求：配置大分区先说明职责，公共可配置成员/props/事件/hooks/工具逐项说明用途、允许值、默认/空值和示例；回调说明入参、返回和副作用，覆盖项说明替换哪一步。@example 独立成行，不用行内注释塞示例。详细规则见类型规范 §7；改动需核验实际 TS 悬停，不能只补 README。
- 缓存/草稿沿用公共存储与稳定模块 key；不另写一套存储。缓存实例固定自身实体 ID，不监听全局路由而让后台页面加载其他记录。
- 保留 `animate.css/exceljs/decimal.js/dayjs`；不恢复 ESLint、Stylelint、Husky、提交钩子、代码生成器或已移除 CRUD 框架。
- 老项目仅供参考，未明确要求不修改、不迁入 Vue 2/Vuex 耦合代码；不手改 dist、依赖或 `src/types/generated/`。

## 怎么查

具体阅读范围和源码入口只维护在 [docs/README.md](./docs/README.md)：模块、子表、字段、API/类型、缓存、草稿各按任务定位。选中的规则完整读取；代码只沿当前任务的依赖追踪，不遍历无关示例和 archive。

## 怎么交付

- TS/Vue 改动至少 `pnpm type-check`；跨模块/构建改动 `pnpm build`；风险相关行为运行对应 `node --test`。
- 交互改动验证实际路由、控制台及必要的明暗/窄屏；同步菜单、权限、标签和返回路径。不为镜像低风险改动堆测试。
- 文档检查链接与 Markdown；只格式化本次文件，遵守 Prettier/EditorConfig（UTF-8、LF、两空格、100 列）。
- 交付说明：改了什么、复用了什么、执行的验证、未验证项/Mock 边界。长期规则更新唯一主文档，不在 docs 留执行流水或阶段验收记录。
