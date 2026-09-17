import test from "node:test";
import assert from "node:assert/strict";
import {
  createUserDataKey,
  createUserDataStore,
  UserDataConflictError,
  UserDataCapacityError,
} from "../src/utils/user-data/index.ts";

const key = (kind = "draft", userId = "1", moduleKey = "base/trm") =>
  createUserDataKey({ kind, userId, moduleKey, slot: "edit", entityId: "123" });
function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(i) {
      return [...values.keys()][i] ?? null;
    },
    getItem(k) {
      return values.get(k) ?? null;
    },
    setItem(k, v) {
      values.set(k, v);
    },
    removeItem(k) {
      values.delete(k);
    },
  };
}

test("用户数据 Key 可读，保留 ID 类型并避免分隔符碰撞", () => {
  assert.match(key(), /base\/trm\/edit\/string:123$/);
  assert.notEqual(key("draft", 1), key("draft", "1"));
  assert.notEqual(key("draft", "a/b"), key("draft", "a%2Fb"));
  assert.throws(() => key("draft", Number.MAX_SAFE_INTEGER + 1));
});
test("偏好降级本地存储，草稿只降级内存且读取快照互不影响", async () => {
  const local = storage();
  const store = createUserDataStore({ indexedDB: null, localStorage: local });
  assert.equal(
    (await store.write(key("preferences"), { width: 80 }, { schemaVersion: 1 })).level,
    "localStorage"
  );
  assert.equal(
    (
      await store.write(
        key("draft", "1", "preferences/demo"),
        { name: "A" },
        { schemaVersion: 1, expectedRevision: null }
      )
    ).level,
    "memory"
  );
  assert.equal(local.length, 1);
  const record = (await store.read(key("draft", "1", "preferences/demo"))).record;
  record.value.name = "B";
  assert.equal((await store.read(key("draft", "1", "preferences/demo"))).record.value.name, "A");
});
test("草稿版本检查、过期和内存容量均显式处理", async () => {
  let now = 100;
  const store = createUserDataStore({
    indexedDB: null,
    localStorage: null,
    now: () => now,
    maxRecords: 1,
  });
  const first = await store.write(
    key(),
    { name: "A" },
    { schemaVersion: 1, expectedRevision: null, ttlMs: 10 }
  );
  await assert.rejects(
    store.write(key(), { name: "B" }, { schemaVersion: 1, expectedRevision: null }),
    UserDataConflictError
  );
  await assert.rejects(store.remove(key(), null), UserDataConflictError);
  await assert.rejects(
    store.write(key("draft", "2"), {}, { schemaVersion: 1 }),
    UserDataCapacityError
  );
  await store.write(
    key(),
    { name: "C" },
    { schemaVersion: 1, expectedRevision: first.record.revision, ttlMs: 10 }
  );
  now = 111;
  assert.equal((await store.read(key())).record, null);
  await store.write(key("draft", "2"), {}, { schemaVersion: 1 });
});
test("清理用户只删指定类别，取消排队中的旧写入", async () => {
  const store = createUserDataStore({ indexedDB: null, localStorage: storage() });
  await store.write(key("preferences"), {}, { schemaVersion: 1 });
  await store.write(key(), {}, { schemaVersion: 1 });
  const pending = store.write(key(), { name: "old" }, { schemaVersion: 1 });
  const cleanup = store.clearUser({ userId: "1", kind: "draft" });
  await assert.rejects(pending, /取消旧数据写入/);
  await cleanup;
  assert.equal((await store.read(key())).record, null);
  assert.ok((await store.read(key("preferences"))).record);
});

test("退出账号可清理跨租户草稿且不影响其他账号与偏好", async () => {
  const store = createUserDataStore({ indexedDB: null, localStorage: storage() });
  const make = (tenantId, userId = "A", kind = "draft") =>
    createUserDataKey({ tenantId, userId, kind, moduleKey: "base/trm", slot: "add" });
  for (const candidate of [
    make("T1"),
    make("T2"),
    make("T2", "B"),
    make("T1", "A", "preferences"),
  ]) {
    await store.write(candidate, {}, { schemaVersion: 1 });
  }
  await store.clearUser({ userId: "A", kind: "draft" });
  assert.equal((await store.read(make("T1"))).record, null);
  assert.equal((await store.read(make("T2"))).record, null);
  assert.ok((await store.read(make("T2", "B"))).record);
  assert.ok((await store.read(make("T1", "A", "preferences"))).record);
});
