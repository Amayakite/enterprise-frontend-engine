import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, "tests/type-cases/tsconfig.crud-s1.json");
const fixture = path.join(root, "tests/type-cases/crud-s1.ts");
const source = fs.readFileSync(fixture, "utf8");
function compile(project) {
  // 合同已关联泛型 SFC，使用项目相同的 Vue 类型编译器，不能用 *.vue 的空 shim 替代。
  return spawnSync(
    process.execPath,
    ["node_modules/vue-tsc/bin/vue-tsc.js", "--noEmit", "--pretty", "false", "-p", project],
    { encoding: "utf8", cwd: root }
  );
}
test("S1 正向合同与显式负向样例通过编译", () => {
  const result = compile(configPath);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("移除 expect-error 后每个负向样例都被类型系统拒绝", () => {
  const negative = path.join(path.dirname(fixture), ".crud-s1-negative.ts");
  const project = path.join(path.dirname(fixture), ".tsconfig-crud-s1-negative.json");
  const expectedLines = source
    .split(/\r?\n/)
    .flatMap((line, index) => (line.includes("@ts-expect-error") ? [index + 2] : []));
  try {
    fs.writeFileSync(negative, source.replaceAll("@ts-expect-error", "negative-example"));
    fs.writeFileSync(
      project,
      JSON.stringify({
        extends: "./tsconfig.crud-s1.json",
        include: [".crud-s1-negative.ts", "../../src/types/**/*.d.ts"],
      })
    );
    const result = compile(project);
    assert.notEqual(result.status, 0);
    const errors = [...result.stdout.matchAll(/([^\r\n]+)\((\d+),\d+\): error TS\d+:/g)];
    const rejected = new Set(
      errors
        .filter((item) => item[1].endsWith(".crud-s1-negative.ts"))
        .map((item) => Number(item[2]))
    );
    for (const line of expectedLines)
      assert.ok(rejected.has(line), `负向样例第 ${line} 行未被拒绝\n${result.stdout}`);
    assert.equal(errors.length, expectedLines.length, result.stdout + result.stderr);
  } finally {
    fs.rmSync(negative, { force: true });
    fs.rmSync(project, { force: true });
  }
});
