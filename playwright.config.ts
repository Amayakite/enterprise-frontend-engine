import { defineConfig, devices } from "@playwright/test";

/**
 * 固定浏览器回归配置。
 *
 * 测试进程始终自行启动 3001 端口的 Vite Mock，避免读取或写入开发者正在使用的 3000 端口数据。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "artifacts/playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 3001 --strictPort",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_APP_PORT: "3001",
      VITE_MOCK_DEV_SERVER: "true",
      VITE_APP_VUE_DEVTOOLS: "false",
    },
  },
});
