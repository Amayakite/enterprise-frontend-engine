import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h } from "vue";
import { flush, pending } from "./reference-harness.mjs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/utils/auth")
      return {
        url: "data:text/javascript,export const hasPerm = () => true;",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { useCrudForm } = await import("../src/composables/useCrudForm.ts");
const { createUserDataKey, userDataStore } = await import("../src/utils/user-data/index.ts");
const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  patchProp() {},
  parentNode: () => null,
  nextSibling: () => null,
});
function mount(name, overrides = {}) {
  let controller;
  const app = renderer.createApp({
    setup() {
      controller = useCrudForm(
        {
          fields: [],
          createInitial: () => ({ name: "", secret: "", lines: [] }),
          load: async (id) => ({ id, version: 1, name: "server", lines: [] }),
          toModel: (entity) => ({ name: entity.name, secret: "", lines: entity.lines }),
          toCreate: ({ model }) => ({ ...model }),
          toUpdate: ({ model }) => ({ ...model }),
          create: async (dto) => ({ id: "created", dto }),
          update: async (id, dto) => ({ id, dto }),
          resolveSaved: async ({ id, dto }) => ({ id, version: 2, ...dto }),
          getKey: (entity) => entity.id,
          draft: { version: 1, fields: ["name"], getEntityVersion: (entity) => entity.version },
          ...overrides,
        },
        {
          context: () => undefined,
          invalidateViewKey: `test/draft/${name}`,
          draftIdentity: () => ({ userId: "draft-test", instanceKey: "add" }),
        }
      );
      return () => h("div");
    },
  });
  app.mount({});
  return { controller, close: () => app.unmount() };
}
const key = (name) =>
  createUserDataKey({
    kind: "draft",
    userId: "draft-test",
    moduleKey: `test/draft/${name}`,
    slot: "add:add",
  });

test("新增提交成功清除原新增草稿且不生成编辑草稿", async () => {
  const view = mount("saved-cleanup");
  await view.controller.open({ mode: "add" });
  view.controller.patch({ name: "已提交" });
  await view.controller.draft.flush();
  assert.ok((await userDataStore.read(key("saved-cleanup"))).record);
  await view.controller.save();
  assert.equal(view.controller.state.phase, "saved");
  assert.equal((await userDataStore.read(key("saved-cleanup"))).record, null);
  const editKey = createUserDataKey({
    kind: "draft",
    userId: "draft-test",
    moduleKey: "test/draft/saved-cleanup",
    slot: "edit",
    entityId: "created",
  });
  assert.equal((await userDataStore.read(editKey)).record, null);
  view.close();
});

test("草稿表单只保存白名单，重新进入恢复且保持未提交状态", async () => {
  const first = mount("roundtrip");
  await first.controller.open({ mode: "add" });
  first.controller.patch({ name: "半填名称", secret: "不得存储" });
  assert.equal(await first.controller.draft.flush(), true);
  const stored = await userDataStore.read(key("roundtrip"));
  assert.deepEqual(stored.record.value.model, { name: "半填名称" });
  first.close();
  const second = mount("roundtrip");
  await second.controller.open({ mode: "add" });
  assert.equal(second.controller.draft.state.phase, "available");
  const hydration = second.controller.state.hydrationRevision;
  assert.equal(await second.controller.draft.restore(), true);
  assert.equal(second.controller.state.hydrationRevision, hydration + 1);
  assert.equal(second.controller.state.model.name, "半填名称");
  assert.equal(second.controller.state.model.secret, "");
  assert.equal(second.controller.state.dirty, true);
  assert.equal(await second.controller.draft.discard(), true);
  second.close();
});

test("提交结果未知的本机草稿重新进入后阻止恢复及重复提交", async () => {
  let requests = 0;
  const overrides = {
    create: async () => {
      requests++;
      throw new Error("connection lost");
    },
  };
  const first = mount("unknown", overrides);
  await first.controller.open({ mode: "add" });
  first.controller.patch({ name: "不可重复提交" });
  await first.controller.save();
  assert.equal(first.controller.state.mutationOutcome, "unknown");
  assert.equal((await userDataStore.read(key("unknown"))).record.value.outcome, "pending");
  first.close();
  const second = mount("unknown", overrides);
  await second.controller.open({ mode: "add" });
  assert.equal(second.controller.draft.state.phase, "unsafe");
  assert.equal(await second.controller.draft.restore(), false);
  await second.controller.save();
  assert.equal(requests, 1);
  second.close();
});

test("主表草稿携带独立子表快照，恢复不执行子表提交校验", async () => {
  let commits = 0;
  let child = {
    rows: [{ key: "new-1", name: "" }],
    active: { rowKey: "new-1", values: { name: "半填" } },
  };
  const port = () => ({
    key: "lines",
    isDirty: () => true,
    commitDraft: async () => {
      commits++;
      return { proceed: false };
    },
    cancelDraft() {},
    validate: async () => ({ valid: true }),
    focus: async () => {},
    setReadonly() {},
    snapshotDraft: () => structuredClone(child),
    restoreDraft: async (value) => {
      child = value;
      return true;
    },
  });
  const first = mount("children", { childKeys: ["lines"] });
  await first.controller.open({ mode: "add" });
  first.controller.registerChild(port());
  first.controller.patch({ name: "主表" });
  assert.equal(await first.controller.draft.flush(), true);
  first.close();
  child = { rows: [], active: null };
  const second = mount("children", { childKeys: ["lines"] });
  await second.controller.open({ mode: "add" });
  second.controller.registerChild(port());
  await flush();
  assert.equal(await second.controller.draft.restore(), true);
  assert.equal(child.active.values.name, "半填");
  assert.equal(commits, 0);
  await second.controller.draft.discard();
  second.close();
});

test("第二子表恢复失败撤回主表和已恢复的第一子表", async () => {
  await userDataStore.write(
    key("rollback"),
    {
      model: { name: "草稿主表" },
      children: { lines: { value: "草稿子表" }, other: { value: "不兼容" } },
      entityVersion: null,
      outcome: "editing",
    },
    { schemaVersion: 1, expectedRevision: null }
  );
  const view = mount("rollback");
  await view.controller.open({ mode: "add" });
  let first = { value: "当前子表" };
  const basePort = {
    isDirty: () => false,
    commitDraft: async () => ({ proceed: true }),
    cancelDraft() {},
    validate: async () => ({ valid: true }),
    focus: async () => {},
    setReadonly() {},
  };
  view.controller.registerChild({
    ...basePort,
    key: "lines",
    snapshotDraft: () => structuredClone(first),
    restoreDraft: async (value) => {
      first = value;
      return true;
    },
  });
  view.controller.registerChild({
    ...basePort,
    key: "other",
    snapshotDraft: () => ({ value: "当前第二子表" }),
    restoreDraft: async (value) => value.value !== "不兼容",
  });
  assert.equal(await view.controller.draft.restore(), false);
  assert.equal(view.controller.state.model.name, "");
  assert.deepEqual(first, { value: "当前子表" });
  assert.equal(view.controller.draft.state.phase, "conflict");
  await view.controller.draft.discard();
  view.close();
});

test("提交pending标记后变更通知和flush不能改写为editing", async () => {
  const request = pending();
  const started = pending();
  const view = mount("marker", {
    create: async () => {
      started.resolve();
      return request.promise;
    },
  });
  await view.controller.open({ mode: "add" });
  view.controller.patch({ name: "待提交" });
  const saving = view.controller.save();
  await started.promise;
  view.controller.draft.changed();
  assert.equal(await view.controller.draft.flush(), false);
  assert.equal((await userDataStore.read(key("marker"))).record.value.outcome, "pending");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal((await userDataStore.read(key("marker"))).record.value.outcome, "pending");
  request.reject(new Error("unknown result"));
  await saving;
  view.close();
});

test("afterOpen 等待草稿决定，读到恢复后的模型；默认值不覆盖草稿", async () => {
  const first = mount("open-hook");
  await first.controller.open({ mode: "add" });
  first.controller.patch({ name: "本机未提交内容" });
  await first.controller.draft.flush();
  first.close();
  const seen = [];
  const second = mount("open-hook", {
    beforeOpen: async () => ({ name: "新增预填" }),
    afterOpen: async ({ model }) => seen.push(model.name),
  });
  const opening = second.controller.open({ mode: "add" });
  for (let i = 0; i < 12; i++) await flush();
  assert.equal(second.controller.draft.state.phase, "available");
  assert.equal(second.controller.busy, false, "等待用户决定时恢复按钮必须可用");
  assert.deepEqual(seen, []);
  assert.equal(await second.controller.draft.restore(), true);
  assert.equal(await opening, true);
  assert.deepEqual(seen, ["本机未提交内容"]);
  assert.equal(second.controller.state.dirty, true);
  await second.controller.draft.discard();
  second.close();
});

test("异步子表尚未登记时恢复保持候选，登记后可恢复而不误判冲突", async () => {
  const first = mount("lazy-children");
  await first.controller.open({ mode: "add" });
  first.controller.patch({ name: "待恢复" });
  await first.controller.draft.flush();
  first.close();
  const second = mount("lazy-children", { childKeys: ["lines"] });
  await second.controller.open({ mode: "add" });
  assert.equal(second.controller.childrenReady, false);
  assert.equal(await second.controller.draft.restore(), false);
  assert.equal(second.controller.draft.state.phase, "available");
  const unregister = second.controller.registerChild({
    key: "lines",
    commitDraft: async () => ({ proceed: true }),
    cancelDraft() {},
    validate: async () => ({ valid: true }),
    focus: async () => {},
    setReadonly() {},
  });
  assert.equal(second.controller.childrenReady, true);
  assert.equal(await second.controller.draft.restore(), true);
  assert.equal(second.controller.state.model.name, "待恢复");
  unregister();
  assert.equal(second.controller.childrenReady, false);
  await second.controller.draft.discard();
  second.close();
});

test("加载期间登记的真实子表绑定在就绪后可编辑，保留草稿重开可恢复", async () => {
  const { useCrudTableChild } = await import("../src/composables/useCrudTableChild.ts");
  const setupChild = (controller) => {
    const binding = useCrudTableChild(controller, "lines", {
      draft: { version: 1, fields: ["id"] },
    });
    binding.register({
      snapshotDraft: () => ({ rows: binding.rows }),
      restoreDraft: async (data) => {
        if (binding.readonly) return false;
        binding.replace(data.rows);
        return true;
      },
      isDirty: () => false,
      commit: async () => true,
      cancel() {},
      validate: async () => ({ valid: true, errors: [] }),
      focus: async () => {},
    });
    return binding;
  };
  const first = mount("loading-child", { beforeOpen: async () => undefined });
  const opening = first.controller.open({ mode: "add" });
  const child = setupChild(first.controller);
  await opening;
  assert.equal(child.readonly, false);
  child.replace([{ id: "draft-row" }]);
  first.controller.patch({ name: "待恢复" });
  assert.equal(await first.controller.draft.flush(), true);
  first.close();

  const seen = [];
  const second = mount("loading-child", {
    beforeOpen: async () => undefined,
    afterOpen: async ({ model }) => seen.push(model.lines),
  });
  const reopened = second.controller.open({ mode: "add" });
  const restored = setupChild(second.controller);
  for (let i = 0; i < 12; i++) await flush();
  assert.equal(second.controller.draft.state.phase, "available");
  assert.equal(await second.controller.draft.restore(), true);
  await reopened;
  assert.deepEqual(restored.rows, [{ id: "draft-row" }]);
  assert.deepEqual(seen, [[{ id: "draft-row" }]]);
  assert.equal(restored.readonly, false);
  await second.controller.draft.discard();
  second.close();
});
