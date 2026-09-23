# 企业前端开发引擎

Enterprise Frontend Engine 是面向企业业务系统的通用前端开发引擎，基于 Vue 3、TypeScript、Vite、Element Plus、Pinia 和 Vue Router。以配置驱动业务页面，复用字段、列表、主子表和操作流程，减少重复装配。

## 核心能力

- **业务装配**：以 `config.ts` 为入口，复用 `MyCrud* + useCrud*`；支持列表、新增、编辑、详情，以及页面、弹窗和抽屉入口。
- **字段与参照**：统一业务字段、普通/高级搜索、参照选择、关联页面跳转与目标操作引导，允许页面局部覆盖回写逻辑。
- **操作体验**：统一成功/失败反馈、权限轻提示、批量操作结果和下一步操作入口。
- **页面基础设施**：动态菜单、按钮权限、标签页、页面缓存、草稿、列偏好，以及明暗主题。

以上是前端能力，不是正式后端服务或安全保障。当前仍处于持续开发阶段。

Ctrl+K（macOS Command+K）打开快捷搜索，支持标题、路由名、路径和 `meta.searchAliases`
声明的别名，方向键选择、Enter 打开、Esc 关闭；只索引当前授权的可见静态菜单，最多显示 30 项。
别名是显式配置，不自动生成拼音。当前 Mock 为客户配置了“客管/客户档案”，销售组织配置了“销组”。
标准 CRUD 表单内支持 Ctrl/Command+S，沿用保存权限与整单校验。

当前接口协议和数据使用开发 Mock；写入只在 Vite 开发进程内保存，重启后恢复种子数据。Mock 成功不代表真实后端、持久化、权限或事务已联调。

## 快速开始

建议使用 Node.js 24 LTS；项目锁定 pnpm 11.16.0。测试使用 Node 的 `registerHooks`，不要仅按 Vite 的最低 Node 版本运行测试。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

默认地址为 `http://localhost:3000`。开发 Mock 账号：`admin / 123456`；验证码填写任意非空值即可。

```bash
pnpm type-check  # TypeScript / Vue 类型检查
pnpm test:quick  # 日常反馈：行为、结构与文档断言，不启动完整 TS/Vue 编译
pnpm test:contracts # 类型正反例、语言服务悬停及混合合同测试
pnpm test        # 合同与行为测试（限制并发，降低内存占用）
pnpm bench:crud  # 0/100/500 行子表模型回写基准（不代表浏览器帧率）
pnpm build       # 类型检查后打包至 dist
pnpm preview     # 预览构建产物，不启动 Mock
pnpm format      # 手动格式化全部文件
```

日常验证按改动范围选择，避免每次修改都跑全量测试：

- 交互改动直接使用内置浏览器或浏览器 MCP 检查实际页面、相关键盘操作和控制台；布局变更再补明暗主题、窄屏检查。不默认引入浏览器测试依赖或自动化脚本。
- TS/Vue 改动运行 `pnpm type-check`；逻辑变更只运行相关的 `node --test tests/<文件>.test.mjs`，公共类型合同变更再补对应合同测试。
- 需要扩大检查范围时使用 `pnpm test:quick` 或 `pnpm test:contracts`；全量 `pnpm test` 留给明确的整体验证或核心跨模块风险，不作为每次提交的固定步骤。
- 构建配置、运行时依赖或影响打包的跨模块改动运行 `pnpm build`，它已包含类型检查，无需重复执行。纯文档、测试设施清理不默认构建；`pnpm bench:crud` 只在排查性能时使用。
- 验证通过后，仅在新增修改、失败或仍有疑点时补测，不反复执行相同检查。

`node scripts/run-tests.mjs quick --list` 可查看分组；quick 与 contracts 没有交集，合起来就是完整集。
新增创建 TypeScript/Vue 程序或语言服务的测试需登记到 `scripts/test-groups.mjs`。

## 开发入口

开发者与 AI 从 [项目速查卡 AGENTS.md](./AGENTS.md) 开始，再按 [任务导航](./docs/README.md) 定位文档章节与源码，不必通读所有指南。

最简模块从 [Sale 示例](./docs/sale-example.md) 开始；复杂主子表参考 [customer](./docs/customer-example.md) 的职责划分。默认 add/edit 各自装配，子表各有独立 config。费用仅作局部能力参考，服务申请和会议申请不作为结构范本；具体规则与示例统一由任务导航进入。

## 注释与配置可读性

业务配置应能顺序读懂：简单模块的主字段和子表注册直接放在 config.ts，
每个大分区前有 JSDoc 说明。公共配置成员、类型、props、事件、hooks 和工具都必须有
实际声明处的注释，说明用途、允许值、默认行为、参数/返回及可复制示例；
不能只写一份外围文档代替 VS Code 悬停说明。AI 辅助代码同样执行。
核心 `components/business/` 的匿名参数、嵌套类型、联合分支和控制器端口也适用；
运行 `node --test tests/business-docs.test.mjs` 防止漏注释，语义仍按源码核对。
`@example` 独立成行，复杂例子使用多行代码块；默认逻辑和覆盖方式要一起解释。
完整规则见 [JSDoc 规范](./docs/typescript-and-structure.md#公开-api-jsdoc)，
实际接法见 [模块实操](./docs/module-development-example.md)。

## 目录概览

```text
src/
  api/          接口请求、DTO 与适配
  assets/       图片、图标与公共样式
  components/   common / business / table 共享组件
  composables/  跨组件响应式逻辑
  config/       应用设置、界面默认值与常量
  pages/        页面、页面专属组件和模型
  router/       路由与守卫
  stores/       Pinia 全局状态
  types/        无业务归属的基础类型与声明
  utils/        纯工具
mock/           开发 Mock
tests/          必要的合同与行为验证
```

## 对接新后端

创建不提交的 `.env.development.local`：

```dotenv
VITE_MOCK_DEV_SERVER=false
VITE_APP_API_URL=http://localhost:8000
VITE_APP_BASE_API=/dev-api
VITE_APP_TITLE=新项目名称
VITE_APP_VUE_DEVTOOLS=true # 需要组件树/更新时间线排查时才开启
```

修改环境变量后重启开发服务。当前响应协议为 `{ code, data, msg }`、分页为 `{ list, total }`，尚未适配新的正式后端；应从 API 层、请求层、菜单转换和权限映射统一适配，不能让页面依赖完整后端路径。

与后端确认接口时使用 [接口契约草案](./docs/backend-contract-draft.md)，其中区分当前 Mock 合同与待确认协议。

## 构建与部署

`pnpm build` 输出到 `dist/`。默认部署在域名根目录；子目录部署时设置 `VITE_APP_BASE_PATH`，并配置服务器的静态资源与路由回退规则。生产 API 前缀由 `VITE_APP_BASE_API` 决定，开发代理不会成为生产代理，需要服务器另外配置。

生产构建不包含开发 Mock，`pnpm preview` 不能替代正式后端。所有 `VITE_*` 变量都可能暴露给浏览器，不要放入密钥或数据库凭据。

## 仓库维护

- 提交源码、当前文档、测试、`pnpm-lock.yaml` 和安全的默认环境配置；本机覆盖使用 `.env.*.local`。
- `.gitignore` 排除依赖、构建产物、日志、测试截图/报告、缓存、本地环境和常见私钥文件。测试截图统一放在 `artifacts/`，不要散落仓库根目录。
- `src/types/generated/` 是构建工具维护的类型声明，保留版本管理，不手工修改；`.vscode` 仅保留共享设置和扩展推荐。
- 按[快速开始](#快速开始)中的改动范围选择验证；只格式化本次修改的文件。
- GitHub 仓库地址确定后，再在 `package.json` 中填写实际 `repository`；当前不使用上游仓库地址冒充本项目地址。
- 在决定公开仓库之前，确认许可证、第三方版权声明及敏感信息；忽略规则不会移除已经提交到 Git 历史中的秘密。

## 项目边界

- 保留 `animate.css`、`exceljs`、`decimal.js`、`dayjs`、ECharts、WangEditor、`vxe-table`；保留依赖不代表业务功能已接入。
- 不恢复 ESLint、Stylelint、Git 钩子、代码生成器或已移除的 CRUD 框架。
