import test from "node:test";
import assert from "node:assert/strict";
import {
  createViewLeaveGuardRegistry,
  createViewOperationLock,
} from "../src/stores/view-leave-guards.ts";

test("后台标签关闭逐个执行公开离开保护，并在拒绝后停止", async () => {
  const registry = createViewLeaveGuardRegistry();
  const calls = [];
  registry.register("/edit/1", async () => {
    calls.push("/edit/1");
    return true;
  });
  registry.register("/edit/2", async () => {
    calls.push("/edit/2");
    return false;
  });
  registry.register("/edit/3", () => {
    calls.push("/edit/3");
    return true;
  });

  assert.equal(await registry.canRemove(["/edit/1", "/edit/1", "/edit/2", "/edit/3"]), false);
  assert.deepEqual(calls, ["/edit/1", "/edit/2"]);
});

test("旧页面的注销函数不会移除同路径的新页面保护", async () => {
  const registry = createViewLeaveGuardRegistry();
  const unregisterOld = registry.register("/edit/1", () => false);
  registry.register("/edit/1", () => true);
  unregisterOld();

  assert.equal(await registry.canRemove(["/edit/1"]), true);
  registry.clear();
  assert.equal(await registry.canRemove(["/edit/1"]), true);
});

test("批量关闭后续页面拒绝时撤回先前页面的离开许可", async () => {
  const registry = createViewLeaveGuardRegistry();
  let rolledBack = 0;
  registry.register(
    "/edit/1",
    () => true,
    () => rolledBack++
  );
  registry.register("/edit/2", () => false);

  assert.equal(await registry.canRemove(["/edit/1", "/edit/2"]), false);
  assert.equal(rolledBack, 1);
});

test("标签操作锁覆盖完整异步流程且连续触发不重复执行", async () => {
  const lock = createViewOperationLock();
  let release;
  let calls = 0;
  const first = lock.run(async () => {
    calls++;
    await new Promise((resolve) => (release = resolve));
  });
  const second = lock.run(async () => calls++);

  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  await lock.run(async () => calls++);
  assert.equal(calls, 2);
});

test("批量关闭的异步守卫异常也会撤回先前许可", async () => {
  const registry = createViewLeaveGuardRegistry();
  let approved = false;
  registry.register(
    "/edit/1",
    () => (approved = true),
    () => (approved = false)
  );
  registry.register("/edit/2", async () => {
    throw new Error("守卫失败");
  });
  await assert.rejects(registry.canRemove(["/edit/1", "/edit/2"]), /守卫失败/);
  assert.equal(approved, false);
});
