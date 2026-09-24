import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h, reactive } from "vue";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/"))
      return {
        url: new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

const { useCrudColumns } = await import("../src/composables/useCrudColumns.ts");
const { userDataStore } = await import("../src/utils/user-data/index.ts");
const { clearPreferenceSession } = await import("../src/utils/user-data/preferences.ts");
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

function mount(setup) {
  let state;
  const app = renderer.createApp({
    setup() {
      state = setup();
      return () => h("div");
    },
  });
  app.mount({});
  return { state, close: () => app.unmount() };
}

test("列偏好兼容旧存储，并原子应用顺序、列宽、固定位置和对齐", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const identity = reactive({ user: "tester", module: "orders", version: "1" });
  const storageKey = `vea:crud-columns:${JSON.stringify(identity)}`;
  values.set(
    storageKey,
    JSON.stringify({
      columns: [
        { key: "amount", visible: true, width: 220 },
        { key: "name", visible: false, width: 100 },
      ],
      density: "comfortable",
    })
  );

  const view = mount(() =>
    useCrudColumns(
      [
        { key: "name", label: "名称", width: 100, fixed: "left" },
        { key: "amount", label: "金额", width: 140, align: "right" },
      ],
      () => identity
    )
  );
  assert.deepEqual(
    view.state.items.value.map(({ key, fixed, align }) => ({ key, fixed, align })),
    [
      { key: "name", fixed: "left", align: "left" },
      { key: "amount", fixed: "none", align: "right" },
    ]
  );
  assert.equal(view.state.density.value, "comfortable");

  const applied = view.state.apply(
    [
      {
        key: "name",
        visible: true,
        width: Number.NaN,
        fixed: "none",
        align: "center",
      },
      { key: "amount", visible: true, width: 180, fixed: "right", align: "left" },
    ],
    "compact"
  );
  assert.equal(applied, true);
  assert.deepEqual(
    view.state.columns.value.map(({ key, width, fixed, align }) => ({ key, width, fixed, align })),
    [
      { key: "name", width: 100, fixed: undefined, align: "center" },
      { key: "amount", width: 180, fixed: "right", align: "left" },
    ]
  );
  assert.equal(
    view.state.apply(
      view.state.items.value.map((item) => ({ ...item, visible: false })),
      "comfortable"
    ),
    false
  );
  assert.equal(view.state.density.value, "compact");

  view.close();
  delete globalThis.localStorage;
});

test("分组表头作为不可拆单元归一化顺序和固定位置", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const identity = reactive({ user: "tester", module: "grouped", version: "1" });
  const headerGroup = {
    key: "base",
    label: "基本资料",
    align: "right",
    fixed: "left",
  };
  const view = mount(() =>
    useCrudColumns(
      [
        { key: "code", label: "编号", headerGroup },
        { key: "name", label: "名称", headerGroup },
        { key: "owner", label: "负责人" },
      ],
      () => identity
    )
  );
  assert.deepEqual(
    view.state.items.value.slice(0, 2).map(({ fixed, groupAlign }) => ({ fixed, groupAlign })),
    [
      { fixed: "left", groupAlign: "right" },
      { fixed: "left", groupAlign: "right" },
    ],
    "分组 fixed 与 align 可由源码配置提供默认值"
  );

  assert.equal(
    view.state.apply(
      [
        {
          key: "code",
          visible: true,
          fixed: "none",
          align: "left",
          groupAlign: "left",
        },
        { key: "owner", visible: true, fixed: "none", align: "left" },
        {
          key: "name",
          visible: true,
          fixed: "right",
          align: "center",
          groupAlign: "center",
        },
      ],
      "compact"
    ),
    true
  );
  assert.deepEqual(
    view.state.items.value.map(({ key, fixed, groupAlign }) => ({ key, fixed, groupAlign })),
    [
      { key: "code", fixed: "none", groupAlign: "left" },
      { key: "name", fixed: "none", groupAlign: "left" },
      { key: "owner", fixed: "none", groupAlign: undefined },
    ]
  );

  view.state.move("name", 1);
  assert.deepEqual(
    view.state.items.value.map((item) => item.key),
    ["code", "name", "owner"],
    "叶子列不能越过分组边界"
  );
  view.state.move("code", 1);
  assert.deepEqual(
    view.state.items.value.map((item) => item.key),
    ["code", "name", "owner"],
    "组内顺序始终服从源码配置"
  );

  view.close();
  delete globalThis.localStorage;
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
const remoteRecord = (value, revision = "r1") => ({
  value,
  revision,
  schemaVersion: 1,
  updatedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});

test("远端迟到读取不覆盖当前列编辑，写入使用远端版本", async () => {
  let resolveRead;
  const reads = new Promise((resolve) => {
    resolveRead = resolve;
  });
  const writes = [];
  userDataStore.setRemoteAdapter({
    read: () => reads,
    write: async (key, value, options) => {
      writes.push({ key, value, options });
      return remoteRecord(value, "r2");
    },
    remove: async () => {},
  });
  const view = mount(() =>
    useCrudColumns([{ key: "name", label: "名称", width: 100 }], () => ({
      user: "remote-race",
      module: "base/trm",
      version: "1",
    }))
  );
  await settle();
  view.state.update("name", { width: 240 });
  resolveRead(remoteRecord({ columns: [{ key: "name", width: 500 }], density: "compact" }));
  await settle();
  assert.equal(view.state.items.value[0].width, 240);
  assert.equal(writes.at(-1).value.columns[0].width, 240);
  assert.equal(writes[0].options.expectedRevision, "r1");
  assert.match(writes[0].key, /preferences\/base\/trm/);
  assert.equal(view.state.retryable.value, false);
  view.close();
  userDataStore.setRemoteAdapter();
  clearPreferenceSession();
});

test("远端保存失败保留本地列值并可重试；身份切换隔离迟到响应", async () => {
  let fail = true;
  userDataStore.setRemoteAdapter({
    read: async () => null,
    write: async (_key, value) => {
      if (fail) throw new Error("offline");
      return remoteRecord(value);
    },
    remove: async () => {},
  });
  const identity = reactive({ user: "retry-columns", module: "orders", version: "1" });
  const view = mount(() =>
    useCrudColumns([{ key: "name", label: "名称", width: 100 }], () => identity)
  );
  await settle();
  view.state.update("name", { width: 250 });
  await settle();
  assert.equal(view.state.items.value[0].width, 250);
  assert.equal(view.state.retryable.value, true);
  fail = false;
  view.state.retry();
  await settle();
  assert.equal(view.state.retryable.value, false);
  let late;
  userDataStore.setRemoteAdapter({
    read: () =>
      new Promise((resolve) => {
        late = resolve;
      }),
    write: async (_key, value) => remoteRecord(value),
    remove: async () => {},
  });
  identity.user = "late-columns";
  await settle();
  const old = late;
  identity.user = "isolated-columns";
  await settle();
  old(remoteRecord({ columns: [{ key: "name", width: 900 }] }));
  await settle();
  assert.equal(view.state.items.value[0].width, 100);
  view.close();
  late(null);
  userDataStore.setRemoteAdapter();
  clearPreferenceSession();
});

test("慢本机写入不会把远端已同步状态反转为待同步；无后端写失败可重试", async () => {
  const originalWrite = userDataStore.write;
  let release;
  let block = false;
  const committed = [];
  userDataStore.write = async (key, value, options) => {
    if (block) {
      block = false;
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    committed.push(value);
    return originalWrite(key, value, options);
  };
  userDataStore.setRemoteAdapter({
    read: async () => null,
    write: async (_key, value) => remoteRecord(value),
    remove: async () => {},
  });
  const view = mount(() =>
    useCrudColumns([{ key: "name", label: "名称" }], () => ({
      user: "slow-write",
      module: "orders",
      version: "1",
    }))
  );
  try {
    await settle();
    block = true;
    view.state.update("name", { width: 240 });
    await settle();
    release();
    await settle();
    assert.equal(committed.at(-1).sync.pending, false);
    assert.equal(committed.at(-1).columns[0].width, 240);
    userDataStore.setRemoteAdapter();
    let fail = true;
    userDataStore.write = async (...args) => {
      if (fail) throw new Error("quota");
      return originalWrite(...args);
    };
    view.state.update("name", { width: 260 });
    await settle();
    assert.equal(view.state.retryable.value, true);
    fail = false;
    view.state.retry();
    await settle();
    assert.equal(view.state.retryable.value, false);
    assert.equal(view.state.items.value[0].width, 260);
  } finally {
    view.close();
    userDataStore.write = originalWrite;
    userDataStore.setRemoteAdapter();
    clearPreferenceSession();
  }
});

test("清理登录会话后迟到远端数据不能回写仍待卸载的页面", async () => {
  let resolveRead;
  userDataStore.setRemoteAdapter({
    read: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    write: async (_key, value) => remoteRecord(value),
    remove: async () => {},
  });
  const view = mount(() =>
    useCrudColumns([{ key: "name", label: "名称", width: 100 }], () => ({
      user: "logout-columns",
      module: "orders",
      version: "1",
    }))
  );
  await settle();
  clearPreferenceSession();
  resolveRead(remoteRecord({ columns: [{ key: "name", width: 800 }] }));
  await settle();
  assert.equal(view.state.items.value[0].width, 100);
  view.close();
  userDataStore.setRemoteAdapter();
});

test("列设置共用规则保留清除宽度语义，并保持分组预览与应用一致", async () => {
  const { normalizeColumnPreferences, groupColumnPreferences, applyColumnPreference } =
    await import("../src/components/table/column-preferences.ts");
  const columns = [
    { key: "a", width: 120, headerGroup: { key: "group", label: "分组", align: "right" } },
    { key: "b", width: 160, headerGroup: { key: "group", label: "分组", align: "right" } },
  ];
  const defaults = columns.map((column) => ({
    key: column.key,
    visible: true,
    width: column.width,
    fixed: "none",
    align: "left",
  }));
  const input = [
    { key: "b", visible: false, fixed: "right" },
    { key: "a", fixed: "left" },
    { key: "a", width: 999 },
    { key: "unknown" },
  ];
  const before = structuredClone(input);
  const editor = normalizeColumnPreferences(columns, input, defaults, "editor");
  const stored = normalizeColumnPreferences(columns, input, defaults, "storage");
  assert.deepEqual(
    editor.map((item) => item.key),
    ["b", "a"]
  );
  assert.equal(editor[0].width, undefined);
  assert.equal(stored[0].width, 160);
  const groups = groupColumnPreferences(columns, editor);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].items.map((item) => item.key),
    ["a", "b"]
  );
  assert.ok(groups[0].items.every((item) => item.fixed === "left" && item.groupAlign === "right"));
  assert.equal(applyColumnPreference(columns[1], groups[0].items[1]), undefined);
  const applied = applyColumnPreference(columns[0], groups[0].items[0]);
  assert.equal(applied.fixed, "left");
  assert.equal(applied.headerGroup.fixed, "left");
  assert.equal(applied.width, undefined);
  assert.deepEqual(input, before);
  assert.equal(columns[0].width, 120);
});
