import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h, ref, reactive, computed, watch, nextTick, KeepAlive } from "vue";
import { flush, pending } from "./reference-harness.mjs";

const permissions = new Set();
let confirm = async () => "confirm";
globalThis.__crudTestPerm = (value) => permissions.has(value);
globalThis.__crudTestConfirm = (...args) => confirm(...args);
// ElMessageBox 由生产构建的自动导入插件提供；Node 合同测试需显式补齐同名全局。
globalThis.ElMessageBox = {
  confirm: (...args) => globalThis.__crudTestConfirm(...args),
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/utils/auth")
      return {
        url: "data:text/javascript,export const hasPerm = value => globalThis.__crudTestPerm(value);",
        shortCircuit: true,
      };
    if (specifier === "element-plus" && context.parentURL?.includes("/useCrud"))
      return {
        url: "data:text/javascript,export const ElMessageBox = {confirm: (...args) => globalThis.__crudTestConfirm(...args)};",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { useCrudList } = await import("../src/composables/useCrudList.ts");
const { invalidateView } = await import("../src/composables/useViewInvalidation.ts");
const { useCrudForm } = await import("../src/composables/useCrudForm.ts");
const { useCrudDetail } = await import("../src/composables/useCrudDetail.ts");
const { useCrudColumns } = await import("../src/composables/useCrudColumns.ts");
const { createQueryDraft } = await import("../src/components/business/search/model.ts");
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
  return {
    get state() {
      return state;
    },
    close: () => app.unmount(),
  };
}
function mountKept(setup) {
  let state;
  const visible = ref(true);
  const Child = {
    setup() {
      state = setup();
      return () => h("div");
    },
  };
  const app = renderer.createApp({
    setup: () => () => h(KeepAlive, null, () => (visible.value ? h(Child) : null)),
  });
  app.mount({});
  return {
    get state() {
      return state;
    },
    async reactivate() {
      visible.value = false;
      await nextTick();
      visible.value = true;
      await nextTick();
    },
    close: () => app.unmount(),
  };
}
const empty = { quick: [], normal: [], advanced: null };
const schema = {
  name: {
    label: "名称",
    kind: "text",
    entries: ["quick", "advanced"],
    operators: ["contains", "eq"],
  },
};
const listConfig = (overrides = {}) => ({
  getKey: (row) => row.id,
  columns: [{ key: "name", label: "名称" }],
  query: { schema, initial: empty },
  scope: (ctx) => ({ key: ctx.org, value: ctx }),
  toQuery: (request) => request,
  request: async () => ({
    list: [
      { id: 0, name: "zero" },
      { id: "0", name: "string zero" },
    ],
    total: 2,
  }),
  selection: "multiple",
  pageSize: 10,
  ...overrides,
});
const defaultContext = () => ({ org: "a" });
const clone = (value) => JSON.parse(JSON.stringify(value));

test("S3 列表首次只读一次；草稿不使已应用视图失效，0 与字符串 ID 区分", async () => {
  let requests = 0,
    appliedChanges = 0;
  const view = mount(() => {
    const list = useCrudList(
      listConfig({
        request: async () => {
          requests++;
          return {
            list: [
              { id: 0, name: "a" },
              { id: "0", name: "b" },
            ],
            total: 2,
          };
        },
      }),
      defaultContext
    );
    const projection = computed(() => clone(list.state.applied));
    watch(projection, () => appliedChanges++);
    return list;
  });
  await flush();
  assert.equal(requests, 1);
  view.state.select([0, "0", 1]);
  assert.deepEqual(view.state.state.selectedKeys, [0, "0"]);
  const draft = createQueryDraft(schema, empty);
  draft.quick[0].value = "a";
  view.state.setDraft(draft);
  await flush();
  assert.equal(requests, 1);
  assert.equal(appliedChanges, 0);
  view.state.cancelQuery();
  assert.equal(view.state.state.draft.quick[0].value, null);
  view.state.setDraft(draft);
  await view.state.applyQuery();
  assert.equal(requests, 2);
  assert.deepEqual(view.state.state.selectedKeys, []);
  view.close();
});

test("S3 列表取消迟到响应、范围重置、失败清空；末页回退最多一次", async () => {
  const deferred = [],
    context = ref({ org: "a" });
  const view = mount(() =>
    useCrudList(
      listConfig({
        request: (query, run) => {
          const item = pending();
          deferred.push({ query, run, ...item });
          return item.promise;
        },
      }),
      () => context.value
    )
  );
  const second = view.state.refresh();
  assert.equal(deferred[0].run.signal.aborted, true);
  deferred[1].resolve({ list: [{ id: 1, name: "new" }], total: 1 });
  await second;
  deferred[0].resolve({ list: [{ id: 0, name: "late" }], total: 1 });
  await flush();
  assert.equal(view.state.state.rows[0].id, 1);
  view.state.select([1]);
  context.value = { org: "b" };
  await flush();
  assert.deepEqual(view.state.state.rows, []);
  assert.deepEqual(view.state.state.selectedKeys, []);
  deferred[2].reject(new Error("read failed"));
  await flush();
  assert.match(view.state.state.error, /read failed/);
  assert.equal(view.state.state.loading, false);
  view.close();
  const pages = [];
  const clamp = mount(() =>
    useCrudList(
      listConfig({
        request: async (query) => {
          pages.push(query.pageNum);
          return { list: [], total: 10 };
        },
      }),
      defaultContext
    )
  );
  await flush();
  await clamp.state.setPage(2, 10);
  assert.deepEqual(pages, [1, 2, 1]);
  assert.equal(clamp.state.state.pageNum, 1);
  clamp.close();
});

test("S3 失效刷新仅在成功后确认，请求期间的新失效留到下次恢复", async () => {
  const key = `retry-${Date.now()}`;
  const requests = [];
  const view = mountKept(() =>
    useCrudList(
      listConfig({
        request: () => {
          const item = pending();
          requests.push(item);
          return item.promise;
        },
      }),
      defaultContext,
      { invalidationKey: key }
    )
  );

  requests[0].resolve({ list: [], total: 0 });
  await flush();
  invalidateView(key);
  await view.reactivate();
  assert.equal(requests.length, 2);
  requests[1].reject(new Error("offline"));
  await flush();

  await view.reactivate();
  assert.equal(requests.length, 3, "失败的失效刷新应在下次恢复时重试");
  invalidateView(key);
  requests[2].resolve({ list: [], total: 0 });
  await flush();

  await view.reactivate();
  assert.equal(requests.length, 4, "请求期间产生的新版本不能被较早请求确认");
  requests[3].resolve({ list: [], total: 0 });
  await flush();
  await view.reactivate();
  assert.equal(requests.length, 4, "成功读取最新版本后不应重复刷新");
  view.close();
});

test("S3 动作确认取消、全权限、单飞和已成功但刷新失败", async () => {
  permissions.clear();
  permissions.add("a");
  let writes = 0,
    failRead = false;
  const confirmation = pending();
  confirm = () => confirmation.promise;
  const action = {
    key: "remove",
    label: "删除",
    location: "row",
    permission: ["a", "b"],
    confirm: () => ({ title: "删除", message: "确认？" }),
    execute: async () => {
      writes++;
      failRead = true;
      return { affectedKeys: [0], failed: [{ key: "x", message: "未处理" }] };
    },
  };
  const view = mount(() =>
    useCrudList(
      listConfig({
        actions: [action],
        request: async () => {
          if (failRead) throw new Error("offline");
          return { list: [{ id: 0, name: "zero" }], total: 1 };
        },
      }),
      defaultContext
    )
  );
  await flush();
  assert.equal(view.state.actionAvailability("remove", 0).visible, false);
  permissions.add("b");
  view.state.select([0]);
  const first = view.state.runAction("remove", 0);
  await view.state.runAction("remove", 0);
  confirmation.reject("cancel");
  await first;
  assert.equal(writes, 0);
  assert.equal(view.state.state.error, null);
  assert.deepEqual(view.state.state.selectedKeys, [0]);
  confirm = async () => "confirm";
  await view.state.runAction("remove", 0);
  assert.equal(writes, 1);
  assert.deepEqual(view.state.actionResult.affectedKeys, [0]);
  assert.equal(view.state.actionResult.failed.length, 1);
  assert.match(view.state.state.error, /操作已完成，刷新失败/);
  await view.state.refresh();
  assert.equal(writes, 1);
  view.close();
});

const formConfig = (overrides = {}) => ({
  fields: [],
  createInitial: () => ({ name: "", lines: [] }),
  load: async (id) => ({ id, version: 1, name: `entity-${id}`, lines: [] }),
  toModel: (entity) => ({ name: entity.name, lines: clone(entity.lines) }),
  toCreate: (input) => clone(input.model),
  toUpdate: (input) => ({ ...clone(input.model), version: input.baseline.version }),
  create: async (dto) => ({ id: 0, dto }),
  update: async (id, dto) => ({ id, dto }),
  resolveSaved: async (result) => ({
    id: result.id,
    version: 2,
    name: result.dto.name.trim(),
    lines: clone(result.dto.lines),
  }),
  getKey: (entity) => entity.id,
  ...overrides,
});

test("S4 编辑深链以 loading 初态挂载并沿同一目标完成回填", async () => {
  const loading = pending();
  const view = mount(() =>
    useCrudForm(
      formConfig({
        load: async () => loading.promise,
      }),
      { context: defaultContext, initialTarget: { mode: "edit", id: 9 } }
    )
  );
  assert.equal(view.state.state.phase, "loading");
  assert.deepEqual(view.state.state.target, { mode: "edit", id: 9 });
  const opened = view.state.open({ mode: "edit", id: 9 });
  loading.resolve({ id: 9, version: 1, name: "loaded", lines: [] });
  assert.equal(await opened, true);
  assert.equal(view.state.state.phase, "ready");
  assert.equal(view.state.state.model.name, "loaded");
  view.close();
});

test("S3 整单按草稿提交→一致快照校验→DTO→写入→服务端基线；保存单飞", async () => {
  const events = [],
    writing = pending();
  let writes = 0;
  const view = mount(() =>
    useCrudForm(
      formConfig({
        create: async (dto) => {
          events.push("write");
          writes++;
          await writing.promise;
          return { id: 0, dto };
        },
        validate: async (input) => {
          events.push("business");
          assert.equal(input.model.lines[0].name, "committed");
          return { valid: true };
        },
      }),
      { context: defaultContext }
    )
  );
  const draft = ref(true);
  view.state.registerChild({
    key: "lines",
    isDirty: () => draft.value,
    commitDraft: async () => {
      events.push("commit");
      view.state.patch({ lines: [{ name: "committed" }] });
      draft.value = false;
      return { proceed: true };
    },
    cancelDraft() {},
    validate: async (rows) => {
      events.push("child");
      assert.equal(rows[0].name, "committed");
      return { valid: true };
    },
    focus: async () => {},
    setReadonly() {},
  });
  view.state.registerForm({
    validate: async () => {
      events.push("form");
      return { valid: true };
    },
    clear() {},
    focus() {},
  });
  view.state.patch({ name: "  saved  " });
  const saving = view.state.save();
  await flush();
  await flush();
  await view.state.save();
  assert.equal(writes, 1);
  assert.equal(view.state.busy, true);
  view.state.patch({ name: "must not apply" });
  assert.equal(view.state.state.model.name, "  saved  ");
  writing.resolve();
  await saving;
  assert.deepEqual(events, ["commit", "form", "child", "business", "write"]);
  assert.equal(view.state.state.model.name, "saved");
  assert.equal(view.state.state.baseline.version, 2);
  assert.equal(view.state.state.target.id, 0);
  assert.equal(view.state.state.dirty, false);
  assert.equal(view.state.state.phase, "saved");
  view.close();
});

test("S3 过期验证不写入；已提交回填失败只读重试，后置失败保留基线", async () => {
  let writes = 0,
    syncs = 0,
    failSync = true;
  const validating = pending();
  let shouldWait = true;
  const view = mount(() =>
    useCrudForm(
      formConfig({
        validate: async () => {
          if (shouldWait) await validating.promise;
          return { valid: true };
        },
        create: async (dto) => {
          writes++;
          return { id: 1, dto };
        },
        resolveSaved: async (result) => {
          syncs++;
          if (failSync) throw new Error("sync offline");
          return { id: 1, version: 3, name: result.dto.name, lines: [] };
        },
        afterSave: async () => {
          throw new Error("navigation hook failed");
        },
      }),
      { context: defaultContext }
    )
  );
  const old = view.state.save();
  await flush();
  view.state.patch({ name: "new" });
  validating.resolve();
  await old;
  assert.equal(writes, 0);
  assert.equal(view.state.state.phase, "ready");
  shouldWait = false;
  await view.state.save();
  assert.equal(writes, 1);
  assert.equal(view.state.state.phase, "committed-needs-sync");
  await view.state.save();
  assert.equal(writes, 1);
  failSync = false;
  await view.state.retrySync();
  assert.equal(writes, 1);
  assert.equal(syncs, 2);
  assert.equal(view.state.state.dirty, false);
  assert.equal(view.state.state.baseline.version, 3);
  assert.match(view.state.state.error, /保存成功，后续处理失败/);
  view.close();
});

test("S3 明确拒绝保留输入可重试；未知结果禁重写；脏草稿取消切换不丢数据", async () => {
  let writes = 0,
    reject = true;
  const view = mount(() =>
    useCrudForm(
      formConfig({
        create: async (dto) => {
          writes++;
          if (reject) throw new Error("known reject");
          return { id: 0, dto };
        },
        classifySaveError: () => "rejected",
      }),
      { context: defaultContext }
    )
  );
  view.state.patch({ name: "keep" });
  await view.state.save();
  assert.equal(view.state.state.model.name, "keep");
  assert.equal(view.state.state.mutationOutcome, "rejected");
  confirm = async () => {
    throw "cancel";
  };
  assert.equal(await view.state.open({ mode: "edit", id: 0 }), false);
  assert.equal(view.state.state.model.name, "keep");
  reject = false;
  await view.state.save();
  assert.equal(writes, 2);
  view.close();
  const unknown = mount(() =>
    useCrudForm(
      formConfig({
        create: async () => {
          writes++;
          throw new Error("network");
        },
      }),
      { context: defaultContext }
    )
  );
  await unknown.state.save();
  const count = writes;
  await unknown.state.save();
  assert.equal(writes, count);
  assert.equal(unknown.state.state.mutationOutcome, "unknown");
  unknown.close();
  confirm = async () => "confirm";
});

test("S3 详情 ID 0 与迟到响应，卸载不回写；同 ID 刷新清空旧记录", async () => {
  const requests = [];
  const view = mount(() =>
    useCrudDetail(
      {
        fields: [],
        toModel: (row) => row,
        load: (id, context) => {
          const wait = pending();
          requests.push({ id, context, ...wait });
          return wait.promise;
        },
      },
      defaultContext
    )
  );
  const zero = view.state.load(0);
  const one = view.state.load(1);
  assert.equal(requests[0].context.signal.aborted, true);
  assert.equal(view.state.state.entity, null);
  requests[1].resolve({ name: "one" });
  await one;
  requests[0].resolve({ name: "zero" });
  await zero;
  assert.equal(view.state.state.model.name, "one");
  const refresh = view.state.refresh();
  assert.equal(view.state.state.entity, null);
  view.close();
  requests[2].resolve({ name: "late" });
  await refresh;
  assert.equal(view.state.state.entity, null);
});

test("S3 本机列偏好按用户/模块/版本隔离，旧字段移除与非法值恢复", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const identity = reactive({ user: "a", module: "orders", version: "1" });
  const view = mount(() =>
    useCrudColumns(
      [
        { key: "name", label: "名称", width: 100 },
        { key: "amount", label: "金额" },
      ],
      () => identity
    )
  );
  view.state.update("name", { visible: false });
  view.state.update("amount", { width: 200 });
  view.state.setDensity("comfortable");
  assert.deepEqual(
    view.state.columns.value.map((c) => c.key),
    ["amount"]
  );
  identity.user = "b";
  await flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.state.columns.value.length, 2);
  assert.equal(view.state.density.value, "compact");
  identity.user = "a";
  await flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.state.columns.value.length, 1);
  assert.equal(view.state.columns.value[0].width, 200);
  identity.version = "2";
  await flush();
  assert.equal(view.state.columns.value.length, 2);
  view.state.update("name", { width: NaN });
  assert.equal(view.state.columns.value[0].width, 100);
  view.state.restore();
  assert.equal(view.state.density.value, "compact");
  view.close();
  delete globalThis.localStorage;
});

test("S3 表单 ID 切换和上下文变化使旧加载失效；子草稿也触发离开确认", async () => {
  const calls = [],
    context = reactive({ org: "a" }),
    drafted = ref(false);
  const view = mount(() =>
    useCrudForm(
      formConfig({
        load: (id, run) => {
          const item = pending();
          calls.push({ id, run, ...item });
          return item.promise;
        },
      }),
      { context: () => context }
    )
  );
  const first = view.state.open({ mode: "edit", id: 0 });
  await flush();
  const second = view.state.open({ mode: "edit", id: 1 });
  await flush();
  assert.equal(calls[0].run.signal.aborted, true);
  calls[1].resolve({ id: 1, name: "current", lines: [], version: 2 });
  await second;
  calls[0].resolve({ id: 0, name: "late", lines: [], version: 1 });
  await first;
  assert.equal(view.state.state.model.name, "current");
  const unregister = view.state.registerChild({
    key: "lines",
    isDirty: () => drafted.value,
    commitDraft: async () => ({ proceed: true }),
    cancelDraft: () => {
      drafted.value = false;
    },
    validate: async () => ({ valid: true }),
    focus: async () => {},
    setReadonly() {},
  });
  drafted.value = true;
  assert.equal(view.state.state.dirty, true);
  confirm = async () => {
    throw "cancel";
  };
  assert.equal(await view.state.close(), false);
  assert.equal(drafted.value, true);
  confirm = async () => "confirm";
  assert.equal(await view.state.close(), true);
  assert.equal(drafted.value, false);
  unregister();
  const third = view.state.open({ mode: "edit", id: 0 });
  await flush();
  context.org = "b";
  assert.equal(calls[2].run.signal.aborted, true);
  assert.equal(view.state.state.baseline, null);
  calls[2].resolve({ id: 0, name: "old organization", lines: [], version: 1 });
  await third;
  assert.equal(view.state.state.phase, "load-error");
  assert.notEqual(view.state.state.model.name, "old organization");
  view.close();
});

test("S3 缺失子模块与空错误的失败校验均阻止写入，全量错误按模块定位", async () => {
  let writes = 0,
    focused;
  const view = mount(() =>
    useCrudForm(
      formConfig({
        childKeys: ["lines"],
        create: async () => {
          writes++;
        },
      }),
      { context: defaultContext }
    )
  );
  await view.state.save();
  assert.equal(writes, 0);
  assert.match(view.state.state.error, /尚未登记/);
  view.state.patch({
    lines: Array.from({ length: 12 }, (_, index) => ({
      id: index,
      name: index === 11 ? "" : "ok",
    })),
  });
  let emptyErrors = false;
  view.state.registerChild({
    key: "lines",
    commitDraft: async () => ({ proceed: true }),
    cancelDraft() {},
    validate: async (rows) => {
      assert.equal(rows.length, 12);
      return {
        valid: false,
        issues: emptyErrors
          ? []
          : [{ section: "lines", rowKey: rows[11].id, rowField: "name", message: "末页名称为空" }],
      };
    },
    focus: async (issue) => {
      focused = issue;
    },
    setReadonly() {},
  });
  await view.state.save();
  assert.equal(writes, 0);
  assert.equal(focused.rowKey, 11);
  assert.equal(focused.rowField, "name");
  emptyErrors = true;
  await view.state.save();
  assert.equal(writes, 0);
  assert.match(view.state.state.issues[0].message, /校验未通过/);
  view.close();
});

test("S3 动作确认后重查权限；旧范围的动作错误不污染新范围", async () => {
  permissions.clear();
  permissions.add("write");
  const confirmation = pending(),
    writing = pending(),
    context = reactive({ org: "a" });
  confirm = () => confirmation.promise;
  let writes = 0;
  const view = mount(() =>
    useCrudList(
      listConfig({
        actions: [
          {
            key: "write",
            location: "row",
            label: "写",
            permission: "write",
            confirm: () => ({ title: "写", message: "确认" }),
            execute: async () => {
              writes++;
              await writing.promise;
              return { affectedKeys: [0] };
            },
          },
        ],
      }),
      () => context
    )
  );
  await flush();
  const cancelled = view.state.runAction("write", 0);
  permissions.clear();
  confirmation.resolve();
  await cancelled;
  assert.equal(writes, 0);
  permissions.add("write");
  confirm = async () => "confirm";
  const old = view.state.runAction("write", 0);
  await flush();
  context.org = "b";
  await flush();
  writing.reject(new Error("old failure"));
  await old;
  assert.equal(view.state.state.error, null);
  view.close();
});

test("S3 回填重试后置阶段仍单飞，已提交事实不会被第二次保存覆盖", async () => {
  let writes = 0,
    failSync = true;
  const after = pending();
  const view = mount(() =>
    useCrudForm(
      formConfig({
        create: async (dto) => {
          writes++;
          return { id: 1, dto };
        },
        resolveSaved: async (result) => {
          if (failSync) throw new Error("offline");
          return { id: 1, name: result.dto.name, lines: [], version: 1 };
        },
        afterSave: () => after.promise,
      }),
      { context: defaultContext }
    )
  );
  await view.state.save();
  failSync = false;
  const retry = view.state.retrySync();
  await flush();
  assert.equal(view.state.state.phase, "saved");
  assert.equal(view.state.busy, true);
  await view.state.save();
  assert.equal(writes, 1);
  after.resolve();
  await retry;
  assert.equal(view.state.busy, false);
  view.close();
});

test("初始化钩子先准备默认值再回显，失败可重试且不写入", async () => {
  const events = [];
  let fail = true,
    writes = 0;
  const view = mount(() =>
    useCrudForm(
      formConfig({
        beforeOpen: async ({ target, context, signal }) => {
          events.push(["before", target.mode, context.org, signal.aborted]);
          if (fail) throw new Error("选项加载失败");
          return { name: "准备的名称" };
        },
        afterOpen: async ({ model }) => {
          events.push(["after", model.name]);
        },
        create: async () => {
          writes++;
        },
      }),
      { context: defaultContext }
    )
  );
  assert.equal(view.state.state.phase, "loading");
  assert.equal(await view.state.open({ mode: "add" }), false);
  assert.equal(view.state.state.phase, "load-error");
  await view.state.save();
  assert.equal(writes, 0);
  fail = false;
  assert.equal(await view.state.open({ mode: "add" }), true);
  assert.equal(view.state.state.model.name, "准备的名称");
  assert.equal(view.state.state.dirty, false);
  assert.deepEqual(events.at(-1), ["after", "准备的名称"]);
  view.close();
});

test("初始化准备迟到或卸载后不覆盖当前模型、不调用 afterOpen", async () => {
  const waits = [],
    after = [];
  const view = mount(() =>
    useCrudForm(
      formConfig({
        beforeOpen: ({ signal }) => {
          const task = pending();
          waits.push({ ...task, signal });
          return task.promise;
        },
        afterOpen: async ({ model }) => after.push(model.name),
      }),
      { context: defaultContext }
    )
  );
  const first = view.state.open({ mode: "add" });
  await flush();
  const second = view.state.open({ mode: "add" });
  await flush();
  assert.equal(waits[0].signal.aborted, true);
  waits[1].resolve({ name: "当前" });
  assert.equal(await second, true);
  waits[0].resolve({ name: "迟到" });
  assert.equal(await first, false);
  assert.equal(view.state.state.model.name, "当前");
  assert.deepEqual(after, ["当前"]);
  const third = view.state.open({ mode: "add" });
  await flush();
  view.close();
  assert.equal(waits[2].signal.aborted, true);
  waits[2].resolve({ name: "卸载" });
  assert.equal(await third, false);
  assert.deepEqual(after, ["当前"]);
});

test("查询前守卫可阻止请求，详情前后钩子按有效加载顺序执行", async () => {
  let allowed = false,
    requests = 0;
  const list = mount(() =>
    useCrudList(
      listConfig({
        beforeQuery: async () =>
          allowed ? { proceed: true } : { proceed: false, reason: "请补充条件" },
        request: async () => {
          requests++;
          return { list: [], total: 0 };
        },
      }),
      defaultContext
    )
  );
  await flush();
  assert.equal(requests, 0);
  allowed = true;
  await list.state.refresh();
  assert.equal(requests, 1);
  list.close();

  const events = [];
  const detail = mount(() =>
    useCrudDetail(
      {
        fields: [],
        beforeOpen: async (id) => events.push(["before", id]),
        load: async (id) => {
          events.push(["load", id]);
          return { id, name: "记录" };
        },
        toModel: (entity) => ({ name: entity.name }),
        afterOpen: async (entity, model) => events.push(["after", entity.id, model.name]),
      },
      defaultContext
    )
  );
  await detail.state.load(0);
  assert.deepEqual(events, [
    ["before", 0],
    ["load", 0],
    ["after", 0, "记录"],
  ]);
  assert.equal(detail.state.state.phase, "ready");
  detail.close();
});
