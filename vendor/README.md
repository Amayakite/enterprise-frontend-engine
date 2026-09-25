# 本地修复依赖

## EigenPal Core

`docx-editor.dev-core-2.22.0-fixed-grid.tgz` 是 EigenPal Core 2.22.0 的本地构建，
用于修复没有正数表格总宽度、网格列宽完整的固定布局表格被单元格首选宽度撑大的问题。

- 源码：<https://github.com/Amayakite/docx-editor>
- 修复提交：`b65d603106e88f6211fc5b4264c213651277ff8a`
- 分支：`fix/fixed-table-grid-widths`
- SHA-256：`d9d578051c47cc35070739131ac73a77beded4c4a34280c56f46e2d4e631b2ac`
- 包内包含 Apache-2.0 许可证、第三方声明与 HarfBuzz 许可证；未包含 Pro 包。

项目通过 `file:vendor/...tgz` 安装，安装包与锁文件一起提交，其他开发机不依赖本机绝对路径。
包内版本仍为 2.22.0，通过独立文件名和锁文件完整性区分官方包；不要覆盖此安装包的内容。
Vue、i18n、fonts 继续使用官方 2.22.0；`pnpm why @docx-editor.dev/core` 应只解析到一份 Core。

在编辑器仓库使用 Bun 构建：

```powershell
bun run --filter '@docx-editor.dev/i18n' build
bun run --filter '@docx-editor.dev/core' build
bun scripts/generate-third-party-notices.mjs --package=@docx-editor.dev/core
Set-Location packages/core
bun pm pack --destination ../../local
```

将输出安装包复制为新的明确命名文件，再在业务项目执行 `pnpm add @docx-editor.dev/core@file:vendor/<文件名>.tgz`。
检查单实例依赖、执行 `pnpm build`，并验证 Word 试用页的导入、编辑和导出。
上游发布含此修复的版本后，统一升级相关 EigenPal 包、移除本地包引用及此文件对应说明。
