import test from "node:test";
import assert from "node:assert/strict";
import "./reference-harness.mjs";
const { createDictionaryPool } = await import("../src/utils/dictionary-pool.ts");

test("100 行与预热共用请求/选项，零消费者释放，再进入读取最新值", async () => {
  let requests = 0;
  const pool = createDictionaryPool(async () => [{ label: `版本${++requests}`, value: 0 }]);
  const leases = Array.from({ length: 101 }, () => pool.acquire("gender", "user-a"));
  await leases[0].entry.refresh();
  assert.equal(requests, 1);
  assert.equal(pool.size, 1);
  assert.ok(leases.every((x) => x.entry === leases[0].entry));
  await leases[0].entry.refresh();
  assert.equal(requests, 2);
  leases.forEach((x) => x.release());
  assert.equal(pool.size, 0);
  const next = pool.acquire("gender", "user-a");
  await next.entry.refresh();
  assert.equal(requests, 3);
  next.release();
});

test("范围隔离、取消后旧响应不复活，失败可重试", async () => {
  let finish;
  const pool = createDictionaryPool(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const lease = pool.acquire("same", "a");
  const pending = lease.entry.refresh();
  await Promise.resolve();
  lease.release();
  finish([{ value: 1, label: "过期" }]);
  await pending;
  assert.equal(pool.size, 0);
  assert.deepEqual(lease.entry.items.value, []);
  let failed = true;
  const retry = createDictionaryPool(async () => {
    if (failed) throw new Error("离线");
    return [];
  });
  const a = retry.acquire("same", "a"),
    b = retry.acquire("same", "b");
  await a.entry.refresh();
  assert.equal(retry.size, 2);
  assert.match(a.entry.error.value, /离线/);
  failed = false;
  await a.entry.refresh();
  assert.equal(a.entry.error.value, "");
  a.release();
  b.release();
});
