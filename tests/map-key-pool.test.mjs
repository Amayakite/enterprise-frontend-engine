import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCredentials,
  tryMapCredentials,
} from "../src/components/common/MapViewer/key-pool.ts";
import { parseMapCredentials } from "../src/config/maps.ts";

test("凭证解析拒绝错误结构，去重保留完整安全配置且不修改原数组", () => {
  const entries = parseMapCredentials(
    '[{"key":" first ","securityJsCode":"code"},{"key":"first"},{"key":""},{"key":"second"}]'
  );
  assert.deepEqual(normalizeCredentials(entries), [
    { key: "first", securityJsCode: "code" },
    { key: "second" },
  ]);
  assert.equal(entries[0].key, " first ");
  assert.deepEqual(parseMapCredentials(undefined), []);
  for (const invalid of [
    "{}",
    "[null]",
    '[{"key":1}]',
    '[{"key":"k","securityJsCode":1}]',
    "broken",
  ]) {
    assert.throws(() => parseMapCredentials(invalid));
  }
});

test("失败后顺序尝试，成功后不再消耗其它 Key；新一轮允许恢复的 Key", async () => {
  const entries = [{ key: "first" }, { key: "second" }, { key: "third" }];
  const calls = [];
  const result = await tryMapCredentials(
    entries,
    async (entry) => {
      calls.push(entry.key);
      if (entry.key === "first") throw new Error("unavailable");
      return entry.key;
    },
    new AbortController().signal
  );
  assert.equal(result, "second");
  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(
    await tryMapCredentials(entries, async (entry) => entry.key, new AbortController().signal),
    "first"
  );
});

test("全部失败不会循环或泄露原始错误里的 Key", async () => {
  let attempts = 0;
  await assert.rejects(
    tryMapCredentials(
      [{ key: "secret-a" }, { key: "secret-b" }],
      async (entry) => {
        attempts++;
        throw new Error(entry.key);
      },
      new AbortController().signal
    ),
    (error) => !error.message.includes("secret") && error.message.includes("所有")
  );
  assert.equal(attempts, 2);
});

test("取消旧页面后不再尝试剩余 Key或接受旧结果", async () => {
  const controller = new AbortController();
  let attempts = 0;
  await assert.rejects(
    tryMapCredentials(
      [{ key: "a" }, { key: "b" }],
      async () => {
        attempts++;
        controller.abort();
        return "stale";
      },
      controller.signal
    ),
    { name: "AbortError" }
  );
  assert.equal(attempts, 1);
});
