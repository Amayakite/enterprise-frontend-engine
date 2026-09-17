import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import VueDevTools from "vite-plugin-vue-devtools";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { mockDevServerPlugin } from "vite-plugin-mock-dev-server";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { name, version } from "./package.json";

/**
 * 开发服务与构建配置。
 * 环境差异优先放在 .env.<mode>，本机覆盖放在不提交的 .env.<mode>.local。
 * 修改此文件或环境变量后重启开发服务；新增环境变量同步维护 types/env.d.ts。
 */

// 从实际安装位置读取 Element Plus，兼容 pnpm 的依赖目录结构。
// 只收集存在的样式入口，升级依赖时无需手工维护组件名称列表。
// 提前预构建全部组件样式，避免切换页面时反复发现依赖、缓存失效和 504 Outdated Optimize Dep。
const elementPlusRoot = dirname(fileURLToPath(import.meta.resolve("element-plus/package.json")));
const elementPlusStyles = readdirSync(join(elementPlusRoot, "es/components"))
  .filter((name) => existsSync(join(elementPlusRoot, "es/components", name, "style/index.mjs")))
  .map((name) => `element-plus/es/components/${name}/style/index`);

// TableView 只使用表格、列和配置内核；按实际入口预构建，避免加载完整 VXE 组件集合。
const vxeTableEntries = ["vxe-table/es/v-x-e-table", "vxe-table/es/table", "vxe-table/es/column"];

export default defineConfig(({ command, mode }) => {
  // mode 对应 development / production 等环境；VITE_* 的值均按字符串读取。
  // VITE_* 可暴露给浏览器，不用于保存密钥；接口目标地址和请求前缀是两个不同配置。
  const env = loadEnv(mode, process.cwd());
  const apiPrefix = env.VITE_APP_BASE_API || "/dev-api";
  // 仅开发服务且明确开启时加载 Mock 插件；即使使用 development 模式打包也不启用。
  const useMock = command === "serve" && env.VITE_MOCK_DEV_SERVER === "true";
  // 性能排查时可在 .env.development.local 显式开启；默认不加载，避免调试面板影响日常开发体验。
  const useVueDevTools = command === "serve" && env.VITE_APP_VUE_DEVTOOLS === "true";

  return {
    // 静态资源部署路径：根目录用 /，子目录例如 /admin/；不等同于 API 请求前缀。
    base: env.VITE_APP_BASE_PATH || "/",
    // @ 始终指向 src；调整时同步 tsconfig.json 中的 paths，保证编辑器与构建一致。
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    css: {
      preprocessorOptions: {
        // 为 SCSS 注入共享变量；variables.scss 应只放变量，不放会在每个文件重复输出的规则。
        // 全局 CSS 由 main.ts 引入 assets/styles/index.scss；主题配色统一由 config/app.ts 控制。
        scss: { additionalData: '@use "@/assets/styles/variables.scss" as *;' },
      },
    },
    server: {
      // 监听所有网卡，方便局域网设备调试；仅本机调试可用 pnpm dev --host 127.0.0.1。
      host: "0.0.0.0",
      allowedHosts: true,
      port: Number(env.VITE_APP_PORT) || 3000,
      // 此代理不进入静态构建产物，生产部署需由服务器配置反向代理。
      // 当前 Vite 的 preview 默认继承 server.proxy，目标服务仍需另外启动。
      // 开启 Mock 时，已匹配的接口由 Mock 响应，其余请求可继续代理到本地后端。
      proxy: {
        [apiPrefix]: {
          target: env.VITE_APP_API_URL || "http://localhost:8000",
          // 将请求 Host 改为目标服务的 Host，兼容按域名识别请求的后端。
          changeOrigin: true,
          // 例如 /dev-api/api/v1/users -> http://localhost:8000/api/v1/users。
          // 若新后端要求保留前缀，需同时调整此处和部署服务器的代理规则。
          rewrite: (path) => (path.startsWith(apiPrefix) ? path.slice(apiPrefix.length) : path),
        },
      },
      // 开发服务器启动后预先转换表格装配链，避免首次进入业务列表时发生串行转换瀑布。
      warmup: {
        clientFiles: [
          "./src/components/table/TableView.vue",
          "./src/components/table/MyTable.vue",
          "./src/components/business/crud/MyCrudList.vue",
          "./src/components/business/crud/MyCrudChildTable.vue",
        ],
      },
    },
    plugins: [
      // 编译 Vue 单文件组件；UnoCSS 的规则、快捷类与 SVG 图标集合在 uno.config.ts。
      vue(),
      // 仅开发期提供组件树、更新时间线和路由检查，不进入生产构建。
      ...(useVueDevTools ? [VueDevTools()] : []),
      UnoCSS(),
      ...(useMock ? [mockDevServerPlugin()] : []),
      // 按实际使用自动导入框架 API；项目自己的 API、工具和 composables 仍需显式导入。
      AutoImport({
        imports: [
          "vue",
          "@vueuse/core",
          "pinia",
          "vue-router",
          { "element-plus": ["ElMessage", "ElMessageBox", "ElNotification"] },
        ],
        // Element Plus API 的自动导入按需带上 Sass 样式，与下方组件解析器保持一致。
        resolvers: [ElementPlusResolver({ importStyle: "sass" })],
        // 模板表达式中使用的 API 也参与自动导入。
        vueTemplate: true,
        // 自动生成声明用于编辑器提示和 vue-tsc，保留版本管理，不手工修改。
        dts: "src/types/generated/auto-imports.d.ts",
      }),
      Components({
        // 公共组件与布局组件参与扫描；业务页面的局部组件显式导入，避免全局命名冲突。
        dirs: ["src/components", "src/pages/layout/components"],
        resolvers: [ElementPlusResolver({ importStyle: "sass" })],
        dts: "src/types/generated/components.d.ts",
      }),
    ],
    optimizeDeps: {
      // 开发期依赖预构建，不是生产打包分包配置，也不代表这些库全部进入首屏。
      // 保留基础依赖及 Element Plus 样式入口，变更后验证冷启动与动态页面跳转。
      include: [
        "vue",
        "vue-router",
        // TableView 的实际运行时入口，开发启动时一次性预构建。
        ...vxeTableEntries,
        "pinia",
        "axios",
        "@vueuse/core",
        "nprogress",
        "qs",
        "path-browserify",
        "path-to-regexp",
        "@element-plus/icons-vue",
        "element-plus",
        "element-plus/es",
        "element-plus/es/locale/lang/zh-cn",
        ...elementPlusStyles,
      ],
    },
    // 仅调整 chunk 大小警告阈值（kB）；不限制包大小，也不执行拆包或性能优化。
    build: { chunkSizeWarningLimit: 1200 },
    // 编译时替换的全局常量：config/app.ts 消费，类型在 types/env.d.ts 声明。
    // JSON.stringify 生成合法的 JS 字面量；只暴露界面需要的包名和版本。
    define: { __APP_INFO__: JSON.stringify({ pkg: { name, version } }) },
  };
});
