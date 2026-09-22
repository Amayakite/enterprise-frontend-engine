import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testFiles } from "../scripts/test-groups.mjs";

test("快组与合同组无重叠，合并覆盖完整测试；编译型测试不得混入快组", () => {
  const quick = testFiles("quick"),
    contracts = testFiles("contracts"),
    all = testFiles();
  assert.equal(new Set([...quick, ...contracts]).size, quick.length + contracts.length);
  assert.deepEqual([...quick, ...contracts].sort(), all);
  for (const file of quick)
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /(?:createProgram|createLanguageService)\s*\(|vue-tsc\/bin\/vue-tsc|typescript\/bin\/tsc/,
      `${file} 创建完整类型程序，应登记到 scripts/test-groups.mjs`
    );
  assert.throws(() => testFiles("missing"), /未知测试分组/);
});
