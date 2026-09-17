import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h, computed, reactive, isReadonly, KeepAlive, ref } from "vue";
import { pending, flush } from "./reference-harness.mjs";

globalThis.__pageBase = () => ({
  context: computed(() => ({ organizationId: "org-a", scopeKey: "u:a" })),
  entityId: "0",
  columns: 3,
  notice: "",
  preference: computed(() => undefined),
  draftIdentity: () => undefined,
  presentation: {},
  navigation: {
    add: async () => {},
    edit: async () => {},
    detail: async () => {},
    saved: async () => {},
    close: async () => {},
  },
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./useBusinessPage" && context.parentURL?.endsWith("/useCrudPage.ts"))
      return {
        url: "data:text/javascript,export const useBusinessPage = () => globalThis.__pageBase()",
        shortCircuit: true,
      };
    if (specifier === "@/utils/auth")
      return { url: "data:text/javascript,export const hasPerm = () => true", shortCircuit: true };
    if (specifier.endsWith("/alert/style/css"))
      return { url: "data:text/javascript,export {}", shortCircuit: true };
    return next(specifier, context);
  },
});
globalThis.ElMessageBox = { confirm: async () => "confirm" };
const { useCrudView } = await import("../src/composables/useCrudView.ts");
const { useCrudPage } = await import("../src/composables/useCrudPage.ts");
const { defineAggregateBinding } = await import("../src/components/business/crud/aggregate.ts");
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
function mount(options, extra = {}) {
  const events = [];
  const form = {
    fields: [],
    createInitial: () => ({ name: "", lines: [] }),
    load: async (id) => {
      events.push(["load", id]);
      return { id, name: "server", lines: [] };
    },
    toModel: (entity) => ({ name: entity.name, lines: entity.lines }),
    toCreate: ({ model }) => ({ ...model }),
    toUpdate: ({ model }) => ({ ...model }),
    create: async (dto) => {
      events.push(["write", dto]);
      return { id: 0, ...dto };
    },
    update: async (id, dto) => ({ id, ...dto }),
    resolveSaved: async (entity) => entity,
    getKey: (entity) => entity.id,
    ...extra.form,
  };
  const module = {
    meta: { key: "page-test" },
    page: extra.page ?? { add: { mode: "tab" }, edit: { mode: "tab" } },
    links: [],
    context: (base) => base,
    parseId: (value) => Number(value),
    children: extra.children ?? {},
    createRuntime: () => ({
      key: "page-test",
      form,
      detail: {
        fields: [],
        load: form.load,
        toModel: form.toModel,
        ...extra.detail,
      },
      list: extra.list ?? {},
    }),
  };
  let page;
  const visible = ref(true);
  const component = {
    setup() {
      page = (extra.facade ? useCrudView : useCrudPage)(module, options);
      return () => h("div");
    },
  };
  const app = renderer.createApp({
    setup: () => () => h(KeepAlive, null, { default: () => (visible.value ? h(component) : null) }),
  });
  app.mount({});
  return { page, events, visible, close: () => app.unmount() };
}
async function ready(view) {
  for (let i = 0; i < 30; i++) {
    await flush();
    if (
      view.page.state.phase === "ready" ||
      view.page.form?.state.phase === "ready" ||
      view.page.detail?.state.phase === "ready"
    )
      return;
  }
  assert.fail("初始化未完成");
}

test("缓存详情仅在模块保存失效后重读自身记录", async () => {
  const { invalidateView } = await import("../src/composables/useViewInvalidation.ts");
  const view = mount({ view: "detail" });
  await ready(view);
  assert.deepEqual(view.events, [["load", 0]]);
  view.visible.value = false;
  await flush();
  view.visible.value = true;
  await flush();
  assert.equal(view.events.length, 1);
  view.visible.value = false;
  await flush();
  invalidateView("page-test");
  assert.equal(view.events.length, 1);
  view.visible.value = true;
  await ready(view);
  assert.deepEqual(view.events, [
    ["load", 0],
    ["load", 0],
  ]);
  view.close();
});
test("统一页面共用校验先行，页面 state 隔离且不进入保存 DTO", async () => {
  const sequence = [];
  const view = mount(
    {
      view: "add",
      state: () => ({ hint: "" }),
      hooks: {
        beforeOpen: async (input) => {
          assert.equal(isReadonly(input.state), true);
          return { state: { hint: "已准备" }, defaults: { name: "new" } };
        },
        validate: async () => {
          sequence.push("local");
          return { valid: true };
        },
        afterSave: async ({ entity, state }) => {
          assert.equal(entity.id, 0);
          assert.equal(state.hint, "已准备");
          sequence.push("saved");
        },
      },
    },
    {
      form: {
        validate: async () => {
          sequence.push("common");
          return { valid: false, issues: [] };
        },
      },
    }
  );
  await ready(view);
  assert.equal(view.page.form.state.model.name, "new");
  assert.equal(view.page.state.hint, "已准备");
  await view.page.form.save();
  assert.deepEqual(sequence, ["common", "local"]);
  assert.equal(
    view.events.some((event) => event[0] === "write"),
    false
  );
  view.close();

  const saved = mount({ view: "add", state: () => ({ hint: "only UI" }) });
  const other = mount({ view: "add", state: () => ({ hint: "only UI" }) });
  await ready(saved);
  await ready(other);
  saved.page.state.hint = "changed";
  assert.equal(other.page.state.hint, "only UI");
  saved.page.form.patch({ name: "业务字段" });
  await saved.page.form.save();
  const dto = saved.events.find((event) => event[0] === "write")[1];
  assert.deepEqual(Object.keys(dto).sort(), ["lines", "name"]);
  saved.close();
  other.close();
});
test("统一编辑与详情保留数值 ID 0；准备不替代默认实体读取", async () => {
  const editing = mount({
    view: "edit",
    state: () => ({ hint: "" }),
    hooks: {
      beforeOpen: async ({ target }) => {
        assert.equal(target.id, 0);
        return { state: { hint: "editing" } };
      },
    },
  });
  await ready(editing);
  assert.deepEqual(editing.events[0], ["load", 0]);
  assert.equal(editing.page.form.state.model.name, "server");
  editing.close();
  const detail = mount({
    view: "detail",
    hooks: { afterOpen: async ({ entity }) => assert.equal(entity.id, 0) },
  });
  await ready(detail);
  assert.deepEqual(detail.events[0], ["load", 0]);
  detail.close();
});
test("统一初始化迟到的 state 补丁在卸载后不应用", async () => {
  const wait = pending();
  const view = mount({
    view: "add",
    state: () => ({ hint: "before" }),
    hooks: { beforeOpen: () => wait.promise },
  });
  await flush();
  view.close();
  wait.resolve({ state: { hint: "late" }, defaults: { name: "late" } });
  await flush();
  assert.equal(view.page.state.hint, "before");
});
test("子表插槽优先于懒加载专属视图，并通过同一绑定回写模型", async () => {
  let loads = 0;
  const config = {
    title: "明细",
    view: {
      component: async () => {
        loads++;
        return { default: { render: () => h("p") } };
      },
    },
    validateRows: () => [],
    persistence: { mode: "aggregate", toPayload: (rows) => rows },
  };
  const binding = defineAggregateBinding()({ modelKey: "lines", payloadKey: "lines", config });
  const view = mount({ view: "add" }, { children: { lines: binding } });
  await ready(view);
  const frame = view.page.render({
    "section-lines": ({ binding, rows }) => {
      assert.deepEqual(rows, []);
      binding.replace([{ name: "一行" }]);
      return [h("p", "自定义")];
    },
  });
  const content = frame.children[2];
  content.children["section-lines"]();
  assert.equal(loads, 0);
  assert.equal(view.page.form.state.model.lines[0].name, "一行");
  view.close();
});

test("默认渲染与高级 bindings 每次提供独立 props；保存回填后更新实体 key", async () => {
  const view = mount({ view: "add" });
  await ready(view);
  const first = view.page.render({}).children[2].props;
  const originalBindings = view.page.bindings.form;
  assert.equal(first.entityKey, "new");
  await view.page.form.save();
  const next = view.page.render({}).children[2].props;
  assert.notEqual(next, first);
  assert.equal(first.entityKey, "new", "旧 VNode 不应通过 getter 变成新 props");
  assert.equal(next.entityKey, 0);
  assert.notEqual(view.page.bindings.form, originalBindings);
  view.close();
});

test("useCrudView 解构 state 始终读取最新模型，辅助状态隔离且保存沿用原控制器", async () => {
  let seen;
  const view = mount(
    {
      view: "add",
      state: () => ({ reviewed: false }),
      hooks: {
        beforeOpen: async ({ state }) => {
          assert.equal(isReadonly(state.custom), true);
          return { state: { reviewed: true }, defaults: { name: "准备值" } };
        },
        beforeSave: async ({ state, model }) => {
          seen = model.name;
          return { proceed: state.custom.reviewed };
        },
      },
    },
    { facade: true }
  );
  const { state, actions, bindings } = view.page;
  await ready(view);
  assert.equal(state.model.name, "准备值");
  assert.equal(state.custom.reviewed, true);
  assert.equal(isReadonly(state.model), true);
  const firstModel = state.model;
  actions.patch({ name: "修改值" });
  assert.equal(state.model.name, "修改值");
  assert.notEqual(state.model, firstModel);
  assert.equal(state.dirty, true);
  assert.equal(state.model, bindings.form.controller.state.model);
  assert.equal(actions.save, bindings.form.controller.save);
  await actions.save();
  assert.equal(seen, "修改值");
  assert.equal(state.dirty, false);
  assert.equal(state.target.id, 0);
  assert.equal(bindings.form.entityKey, 0);
  assert.equal("reviewed" in view.events.find(([kind]) => kind === "write")[1], false);
  view.close();
});

test("useCrudView 子表公开绑定复用原端口，实例辅助状态互不影响", async () => {
  const binding = defineAggregateBinding()({
    modelKey: "lines",
    payloadKey: "lines",
    config: {
      title: "明细",
      validateRows: () => [],
      persistence: { mode: "aggregate", toPayload: (rows) => rows },
    },
  });
  const first = mount(
    { view: "add", state: () => ({ count: 0 }) },
    { facade: true, children: { lines: binding } }
  );
  const second = mount({ view: "add", state: () => ({ count: 0 }) }, { facade: true });
  await ready(first);
  await ready(second);
  const lines = first.page.bindings.child("lines");
  assert.equal(lines, first.page.bindings.child("lines"));
  lines.replace([{ name: "子行" }]);
  assert.equal(first.page.state.model.lines[0].name, "子行");
  first.page.state.custom.count++;
  assert.equal(second.page.state.custom.count, 0);
  assert.throws(() => first.page.bindings.child("missing"), /未配置/);
  first.close();
  second.close();
});

test("useCrudView 详情刷新更新同一 state，编辑复核只读原因并保留宿主绑定", async () => {
  let version = 0;
  const view = mount(
    { view: "detail" },
    {
      facade: true,
      form: { readonlyReason: () => "只读演示" },
      detail: { load: async (id) => ({ id, name: "版本" + ++version, lines: [] }) },
    }
  );
  await ready(view);
  const { state, actions, bindings } = view.page;
  assert.equal(state.model.name, "版本1");
  await actions.refresh();
  assert.equal(state.model.name, "版本2");
  assert.equal(state.model, bindings.detail.controller.state.model);
  assert.equal(state.editReason, "只读演示");
  assert.equal("save" in actions, false);
  assert.equal(bindings.host, undefined);
  view.close();
});

test("useCrudView 已取消初始化不发布 custom/defaults", async () => {
  const wait = pending();
  const view = mount(
    { view: "add", state: () => ({ hint: "初始" }), hooks: { beforeOpen: () => wait.promise } },
    { facade: true }
  );
  await flush();
  view.close();
  wait.resolve({ state: { hint: "过期" }, defaults: { name: "过期" } });
  await flush();
  assert.equal(view.page.state.custom.hint, "初始");
  assert.notEqual(view.page.state.model.name, "过期");
});

test("useCrudView 列表分页、勾选与查询钩子复用同一状态，宿主刷新沿用当前控制器", async () => {
  const requests = [];
  const view = mount(
    {
      view: "list",
      state: () => ({ calls: 0 }),
      hooks: {
        beforeQuery: async ({ state }) => {
          assert.equal(state.custom.calls, 0);
          return { proceed: true };
        },
      },
    },
    {
      facade: true,
      page: { add: { mode: "dialog" } },
      list: {
        query: { schema: {}, initial: { quick: [], normal: [], advanced: null } },
        scope: () => ({ key: "list-test", value: {} }),
        toQuery: (value) => value,
        request: async (request) => {
          requests.push(request);
          return { list: [{ id: 0, name: "当前行" }], total: 30 };
        },
        getKey: (row) => row.id,
        selection: "multiple",
        columns: [],
        actions: [],
      },
    }
  );
  await flush();
  await flush();
  const { state, actions, bindings } = view.page;
  assert.equal(state.rows.length, 1);
  actions.select([0]);
  assert.deepEqual(state.selectedKeys, [0]);
  await actions.setPage(2, 10);
  assert.equal(state.pagination.pageNum, 1, "更换每页条数沿用原控制器回到首页");
  await actions.setPage(2, 10);
  assert.equal(state.pagination.pageNum, 2);
  assert.equal(state.pagination.pageSize, 10);
  assert.equal(state.pagination.total, 30);
  assert.deepEqual(state.selectedKeys, []);
  assert.equal(bindings.list.controller.state.rows, state.rows);
  assert.equal(bindings.list.host, bindings.host, "标准列表应接收同一份自动宿主绑定");
  assert.equal(bindings.host.afterSave, actions.refresh);
  assert.equal(requests.at(-1).pageNum, 2);
  view.close();
});

function fieldEvent(model, changes = { name: model.name }) {
  return { field: "name", reason: "user", previous: { ...model, name: "" }, model, changes };
}
test("change 结果只应用最新事务；新输入取消旧请求，程序回填不重复调用", async () => {
  const calls = [],
    first = pending(),
    second = pending();
  const view = mount(
    {
      view: "add",
      state: () => ({ hint: "" }),
      hooks: {
        change: (input) => {
          calls.push(input);
          return calls.length === 1 ? first.promise : second.promise;
        },
      },
    },
    { facade: true }
  );
  await ready(view);
  const { state, actions, bindings } = view.page;
  actions.patch({ name: "第一次" });
  bindings.form.change(fieldEvent(state.model));
  assert.equal(state.changing, true);
  actions.patch({ name: "第二次输入" });
  assert.equal(calls[0].signal.aborted, true);
  bindings.form.change(fieldEvent(state.model));
  second.resolve({ patch: { name: "第二次结果" }, state: { hint: "最新" } });
  await flush();
  first.resolve({ patch: { name: "过期结果" }, state: { hint: "过期" } });
  await flush();
  assert.equal(state.model.name, "第二次结果");
  assert.equal(state.custom.hint, "最新");
  assert.equal(state.changing, false);
  assert.equal(calls.length, 2);
  view.close();
});

test("change 待完成或失败阻止保存，错误可重试；卸载取消结果回填", async () => {
  let attempt = 0;
  const wait = pending();
  const view = mount(
    {
      view: "add",
      hooks: {
        change: () =>
          ++attempt === 1 ? wait.promise : Promise.resolve({ patch: { name: "重试成功" } }),
      },
    },
    { facade: true }
  );
  await ready(view);
  const { state, actions, bindings } = view.page;
  bindings.form.change(fieldEvent(state.model));
  await actions.save();
  assert.equal(
    view.events.some(([kind]) => kind === "write"),
    false
  );
  wait.reject(new Error("选项暂时不可用"));
  await flush();
  assert.equal(state.changeError, "选项暂时不可用");
  await actions.save();
  assert.equal(
    view.events.some(([kind]) => kind === "write"),
    false
  );
  await actions.retryChange();
  assert.equal(state.changeError, null);
  assert.equal(state.model.name, "重试成功");
  await actions.save();
  assert.equal(view.events.filter(([kind]) => kind === "write").length, 1);
  view.close();

  const late = pending();
  const other = mount({ view: "add", hooks: { change: () => late.promise } }, { facade: true });
  await ready(other);
  other.page.bindings.form.change(fieldEvent(other.page.state.model));
  other.close();
  late.resolve({ patch: { name: "卸载后写入" } });
  await flush();
  assert.notEqual(other.page.state.model.name, "卸载后写入");
});

test("同一编辑实体整体回填不清级联值，后续用户修改仍联动且只通知一次", async () => {
  const { useFormModel } = await import("../src/components/business/MyForm/useFormModel.ts");
  const loaded = pending();
  const view = mount(
    { view: "edit" },
    {
      form: {
        createInitial: () => ({ province: null, city: null }),
        load: () => loaded.promise,
        toModel: (entity) => ({ province: entity.province, city: entity.city }),
      },
    }
  );
  const controller = view.page.form;
  let form;
  const events = [];
  const app = renderer.createApp({
    setup() {
      form = useFormModel(
        {
          get modelValue() {
            return controller.state.model;
          },
          get formKey() {
            return JSON.stringify(["0", controller.state.hydrationRevision]);
          },
          createInitialModel: () => controller.state.model,
          context: {},
          links: [{ watch: ["province"], writes: ["city"], apply: () => ({ city: null }) }],
        },
        (model) => controller.patch(model),
        { enabled: () => true, emit: (event) => events.push(event) }
      );
      return () => h("div");
    },
  });
  app.mount({});
  loaded.resolve({ id: 0, province: 32, city: 3201 });
  await ready(view);
  await flush();
  assert.deepEqual(form.model.value, { province: 32, city: 3201 });
  assert.equal(controller.state.dirty, false);
  assert.equal(events.length, 0);
  const version = controller.state.hydrationRevision;
  form.applyPatch({ province: 31 }, "user", "province");
  form.commit("province");
  await flush();
  assert.deepEqual(controller.state.model, { province: 31, city: null });
  assert.equal(controller.state.hydrationRevision, version);
  assert.equal(events.length, 1);
  await controller.open({ mode: "edit", id: 0 });
  await flush();
  assert.deepEqual(form.model.value, { province: 32, city: 3201 });
  assert.ok(controller.state.hydrationRevision > version);
  assert.equal(events.length, 1);
  app.unmount();
  view.close();
});
