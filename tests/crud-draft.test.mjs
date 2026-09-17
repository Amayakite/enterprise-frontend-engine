import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer, h } from "vue";
import "./reference-harness.mjs";

const { useCrudDraft } = await import("../src/composables/useCrudDraft.ts");
const { userDataStore, createUserDataKey } = await import("../src/utils/user-data/index.ts");
const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {},
});
let sequence = 0;
function mount(options = {}) {
  const userId = options.userId ?? `draft-test-${++sequence}`;
  const model = { name: "server", secret: "never-persist", ...options.model };
  const entity = { version: options.entityVersion ?? 1 };
  const target = options.target ?? { mode: "add" };
  let controller;
  const app = renderer.createApp({
    setup() {
      controller = useCrudDraft(
        {
          version: 1,
          fields: ["name"],
          getEntityVersion: (record) => record.version,
          ...options.config,
        },
        {
          identity: () => ({ userId }),
          moduleKey: "tests/draft",
          target: () => target,
          model: () => model,
          entity: () => entity,
          canEdit: () => options.canEdit !== false,
          isDirty: () => true,
          children: () => options.children ?? [],
          patch: (value) => Object.assign(model, value),
        }
      );
      return () => h("div");
    },
  });
  app.mount({});
  const key = createUserDataKey({
    kind: "draft",
    userId,
    moduleKey: "tests/draft",
    slot: target.mode === "add" ? "add:default" : "edit",
    entityId: target.id,
  });
  return { controller, model, key, userId, close: () => app.unmount() };
}
async function seed(instance, payload = {}, schemaVersion = 1) {
  await userDataStore.write(
    instance.key,
    {
      model: { name: "draft", secret: "injected" },
      children: {},
      entityVersion: 1,
      outcome: "editing",
      ...payload,
    },
    { schemaVersion }
  );
}

test("草稿只保存并恢复声明字段，不恢复未授权字段", async () => {
  const m = mount();
  try {
    await seed(m);
    await m.controller.open();
    assert.equal(m.controller.state.phase, "available");
    assert.equal(await m.controller.restore(), true);
    assert.equal(m.model.name, "draft");
    assert.equal(m.model.secret, "never-persist");
    await m.controller.flush();
    assert.deepEqual((await userDataStore.read(m.key)).record.value.model, { name: "draft" });
  } finally {
    m.close();
    await userDataStore.clearUser({ userId: m.userId });
  }
});
test("结构版本、实体版本与缺少可靠版本阻止恢复", async () => {
  for (const scenario of [
    { target: { mode: "edit", id: "1" }, entityVersion: 2 },
    { target: { mode: "edit", id: "1" }, config: { getEntityVersion: undefined } },
    { schemaVersion: 2 },
  ]) {
    const m = mount(scenario);
    try {
      await seed(m, {}, scenario.schemaVersion ?? 1);
      await m.controller.open();
      assert.equal(m.controller.state.phase, "conflict");
      assert.equal(await m.controller.restore(), false);
      assert.equal(await m.controller.flush(), false);
      assert.equal(m.model.name, "server");
    } finally {
      m.close();
      await userDataStore.clearUser({ userId: m.userId });
    }
  }
});
test("提交结果未知和已提交草稿不能恢复或丢弃绕过", async () => {
  for (const outcome of ["pending", "committed"]) {
    const m = mount();
    try {
      await seed(m, { outcome });
      await m.controller.open();
      assert.equal(m.controller.state.phase, "unsafe");
      assert.equal(m.controller.pending, true);
      assert.equal(await m.controller.restore(), false);
      assert.equal(await m.controller.discard(), false);
      assert.equal(await m.controller.flush(), false);
    } finally {
      m.close();
      await userDataStore.clearUser({ userId: m.userId });
    }
  }
});
test("同一草稿多实例 CAS 冲突不覆盖先保存的内容", async () => {
  const a = mount();
  const b = mount({ userId: a.userId, model: { name: "second" } });
  try {
    await a.controller.open();
    await b.controller.open();
    assert.equal(await a.controller.flush(), true);
    assert.equal(await b.controller.flush(), false);
    assert.equal(b.controller.state.phase, "conflict");
    assert.equal((await userDataStore.read(a.key)).record.value.model.name, "server");
  } finally {
    a.close();
    b.close();
    await userDataStore.clearUser({ userId: a.userId });
  }
});
test("存储失败保留输入，手动重试成功后恢复已保存状态", async () => {
  const m = mount();
  const original = userDataStore.write;
  try {
    await m.controller.open();
    userDataStore.write = async () => {
      throw new Error("temporary write failure");
    };
    assert.equal(await m.controller.flush(), false);
    assert.equal(m.controller.state.phase, "error");
    assert.equal(m.model.name, "server");
    userDataStore.write = original;
    assert.equal(await m.controller.flush(), true);
    assert.equal(m.controller.state.phase, "saved");
  } finally {
    userDataStore.write = original;
    m.close();
    await userDataStore.clearUser({ userId: m.userId });
  }
});
