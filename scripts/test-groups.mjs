import { readdirSync } from "node:fs";

// 会创建 TypeScript/Vue 程序或语言服务的文件整体进入慢组，保留其中所有行为断言。
export const contractFiles = new Set([
  "business-module.test.mjs",
  "common-contract-hover.test.mjs",
  "crud-page-contract.test.mjs",
  "crud-s1-contract.test.mjs",
  "crud-s3-contract.test.mjs",
  "crud-s4-contract.test.mjs",
  "crud-u2-child-table.test.mjs",
  "feedback-config-hover.test.mjs",
  "field-query-hover.test.mjs",
  "module-convenience.test.mjs",
  "navigation-contract-types.test.mjs",
  "query-presets-hover.test.mjs",
]);

/** 新的普通行为测试自动进入 quick；contracts 显式登记，all 不漏任何测试文件。 */
export function testFiles(group = "all") {
  if (!["all", "quick", "contracts"].includes(group)) throw new Error(`未知测试分组：${group}`);
  const files = readdirSync(new URL("../tests/", import.meta.url))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort();
  for (const file of contractFiles)
    if (!files.includes(file)) throw new Error(`合同测试不存在：${file}`);
  return files
    .filter((file) => group === "all" || contractFiles.has(file) === (group === "contracts"))
    .map((file) => `tests/${file}`);
}
