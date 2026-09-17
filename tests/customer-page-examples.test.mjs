import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";
import { createRenderer, h, reactive, readonly, nextTick } from "vue";
import "./reference-harness.mjs";

const loadModule = (source) => ({ format: "module", shortCircuit: true, source });
registerHooks({
  resolve(specifier, context, next) {
    // edit 页复用真实 references；只隔离网络边界，不替换 withMap 合同。
    if (specifier === "@/utils/request")
      return { url: "test:customer-request", shortCircuit: true };
    if (specifier === "@/composables/useCrudView")
      return { url: "test:customer-page", shortCircuit: true };
    if (
      specifier === "./config" &&
      /customer\/(index|add|edit|detail)\.vue$/.test(context.parentURL ?? "")
    )
      return { url: "test:customer-module", shortCircuit: true };
    if (specifier === "@/api/common/batch")
      return { url: "test:customer-batch", shortCircuit: true };
    if (specifier.startsWith("@/") && specifier.endsWith(".vue"))
      return {
        url: new URL("../src/" + specifier.slice(2), import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "test:customer-request")
      return loadModule("export default async () => { throw new Error('本测试不调用网络接口'); };");
    if (url === "test:customer-page")
      return loadModule(
        "export const useCrudView = (module, options) => globalThis.__customerExampleCreate(options);"
      );
    if (url === "test:customer-module") return loadModule("export const customerModule = {};");
    if (url === "test:customer-batch")
      return loadModule(
        "export const executeBatch = async () => { throw new Error('本测试不调用批量接口'); };"
      );
    if (!url.endsWith(".vue")) return next(url, context);
    if (url.endsWith("/MyReference/index.vue") || url.endsWith("/fields/ReferenceDisplay.vue"))
      return loadModule("export default { render: () => null };");
    if (/\/MyCrud(List|Form|Detail)\.vue$/.test(url))
      return loadModule("export default globalThis.__customerExampleShell;");
    if (url.endsWith("/MyBusinessPageHost.vue") || url.endsWith("/CustomerAddresses.vue"))
      return loadModule("export default { render: () => null };");
    if (url.endsWith("/MyDialog.vue"))
      return loadModule("export default globalThis.__customerExampleDialog;");
    if (url.endsWith("/ActionButton.vue"))
      return loadModule("export default globalThis.__customerExampleAction;");
    if (url.endsWith("/CustomerContacts.vue"))
      return loadModule("export default globalThis.__customerExampleContacts;");
    const filename = fileURLToPath(url);
    const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
    const script = compileScript(descriptor, { id: filename, inlineTemplate: true });
    return loadModule(
      ts.transpileModule(script.content.replace("import.meta.env.DEV", "false"), {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      }).outputText
    );
  },
});

// 使用真实页面脚本与编译后 template，仅替换公共控制器/组件边界。
// 原控制器的请求、保存、草稿与异步取消另由 crud-page 等集成测试覆盖。
let current;
globalThis.__customerExampleCreate = (options) => {
  const model = reactive({
    id: "C1",
    customerCode: "KH001",
    customerName: "示例客户",
    shortName: "",
    phone: "",
    remark: "",
    provinceName: "浙江省",
    cityName: "杭州市",
    districtName: "西湖区",
    address: "示例路",
    version: 2,
    contacts: [
      { id: "p1", name: "张三", phone: "13800138000", position: "采购", email: "", primary: true },
    ],
    addresses: [],
  });
  const formState = reactive({ model, dirty: false });
  const listState = reactive({
    rows: [model],
    selectedKeys: [],
    loading: false,
    busyActionKey: null,
  });
  const detailState = reactive({ model, entity: { ...model }, phase: "ready" });
  const binding = {
    get rows() {
      return readonly(model.contacts);
    },
    replace: (rows) => {
      model.contacts = rows;
    },
  };
  const navigations = [];
  const page = {
    state: reactive(options.state?.() ?? {}),
    view: options.view,
    busy: false,
    form: {
      state: formState,
      patch: (patch) => {
        Object.assign(model, patch);
        formState.dirty = true;
      },
    },
    list: { state: listState },
    detail: { state: detailState },
    navigation: { detail: async (id) => navigations.push(id) },
  };
  current = { page, options, model, binding, navigations };
  const viewState =
    options.view === "list" ? listState : options.view === "detail" ? detailState : formState;
  Object.defineProperties(viewState, {
    custom: { value: page.state, enumerable: true },
    busy: { get: () => page.busy, enumerable: true },
  });
  return {
    state: viewState,
    actions: { navigation: page.navigation, edit: async () => {} },
    bindings: {
      form: { controller: page.form },
      list: { controller: page.list },
      detail: { controller: page.detail },
      child: () => binding,
    },
  };
};
globalThis.__customerExampleShell = {
  props: ["controller"],
  setup(props, { slots }) {
    return () => {
      const p = current.page,
        model = current.model;
      const field = (key) => ({
        model: readonly(model),
        value: model[key],
        readonly: p.busy,
        update: (value) => p.form.patch({ [key]: value }),
        commit: () => {},
      });
      return h("shell", [
        slots["before-content"]?.(),
        slots.header?.(p.form),
        slots["toolbar-left"]?.(p.list),
        slots["column-cityName"]?.({
          row: readonly(model),
          value: model.cityName,
          rowKey: model.id,
        }),
        slots["field-remark"]?.(field("remark")),
        slots["field-shortName"]?.(field("shortName")),
        slots["section-contacts"]?.({ binding: current.binding, rows: readonly(model.contacts) }),
        slots["tab-contacts"]?.({ rows: readonly(model.contacts) }),
        slots.actions?.(),
        slots.footer?.(p.view === "detail" ? p.detail : p.form),
        slots["after-content"]?.(),
      ]);
    };
  },
};
globalThis.__customerExampleDialog = {
  props: ["modelValue"],
  setup:
    (props, { attrs, slots }) =>
    () =>
      props.modelValue ? h("dialog", attrs, slots.default?.()) : null,
};
globalThis.__customerExampleAction = {
  setup:
    (_, { attrs }) =>
    () =>
      h("action", attrs, String(attrs.label)),
};
globalThis.__customerExampleContacts = {
  setup:
    (_, { attrs }) =>
    () =>
      h("contacts", attrs),
};

const pages = {};
for (const name of ["index", "add", "edit", "detail"])
  pages[name] = (await import("../src/pages/base/customer/" + name + ".vue")).default;
function remove(node) {
  const list = node.parent?.children;
  if (list) {
    const i = list.indexOf(node);
    if (i >= 0) list.splice(i, 1);
  }
  node.parent = null;
}
const renderer = createRenderer({
  createElement: (tag) => ({ tag, children: [], props: {} }),
  createText: (text) => ({ text, children: [] }),
  createComment: () => ({ children: [] }),
  insert(node, parent, anchor) {
    remove(node);
    parent.children ??= [];
    const i = parent.children.indexOf(anchor);
    parent.children.splice(i < 0 ? parent.children.length : i, 0, node);
    node.parent = parent;
  },
  remove,
  setText: (node, text) => (node.text = text),
  setElementText: (node, text) => {
    node.text = text;
    node.children = [];
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, old, value) => (node.props[key] = value),
});
const textOf = (node) => (node.text ?? "") + (node.children ?? []).map(textOf).join("");
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
function mount(name) {
  const root = { children: [] },
    warnings = [];
  const app = renderer.createApp(pages[name]);
  app.config.warnHandler = (message) => warnings.push(message);
  for (const component of [
    "RouterLink",
    "ElAlert",
    "ElSpace",
    "ElText",
    "ElTag",
    "ElSwitch",
    "ElCheckbox",
    "ElButton",
    "ElInput",
    "ElEmpty",
    "ElDescriptions",
    "ElDescriptionsItem",
  ])
    app.component(component, {
      setup:
        (_, { attrs, slots }) =>
        () =>
          h(component, attrs, slots.default?.()),
    });
  app.mount(root);
  const view = {
    ...current,
    root,
    warnings,
    close: () => {
      app.unmount();
      assert.deepEqual(warnings, []);
    },
  };
  view.button = (label) => {
    const button = find(
      root,
      (node) => ["action", "ElButton"].includes(node.tag) && textOf(node).includes(label)
    );
    assert.ok(button, label);
    return () => {
      if (!button.props.disabled && !button.props.disabledReason) return button.props.onClick?.();
    };
  };
  return view;
}
const input = (view, props = {}) => ({
  ...props,
  signal: new AbortController().signal,
  state: { custom: readonly(view.page.state) },
  model: readonly(view.model),
  context: { organizationId: "org-a", scopeKey: "u" },
  baseline: { version: 2 },
});

test("真实 index：列插槽随 state 切换，选择摘要只使用已加载选中行", async () => {
  const view = mount("index");
  await view.options.hooks.afterQuery(input(view));
  await nextTick();
  assert.equal(view.page.state.queryCount, 1);
  assert.match(textOf(view.root), /浙江省 \/ 杭州市 \/ 西湖区/);
  find(view.root, (n) => n.tag === "ElSwitch").props["onUpdate:modelValue"](false);
  await nextTick();
  assert.doesNotMatch(textOf(view.root), /浙江省 \/ 杭州市/);
  view.page.list.state.selectedKeys = ["C1"];
  await nextTick();
  view.button("选中客户摘要")();
  await nextTick();
  assert.ok(find(view.root, (n) => n.tag === "dialog"));
  await view.button("查看选中客户")();
  assert.deepEqual(view.navigations, ["C1"]);
  view.close();
});

test("真实 add：初始化模板、字段插槽回写、条件校验及保存守卫均可操作", async () => {
  const view = mount("add");
  const prepared = await view.options.hooks.beforeOpen(input(view));
  Object.assign(view.page.state, prepared.state);
  Object.assign(view.model, prepared.defaults);
  await view.options.hooks.afterOpen(input(view));
  await nextTick();
  assert.equal(view.page.state.initialized, true);
  view.button("替换为合作跟进模板")();
  assert.equal(view.model.remark, "合作进展：\n待确认事项：");
  assert.equal(view.page.form.state.dirty, true);
  const phoneCheck = find(
    view.root,
    (n) => n.tag === "ElCheckbox" && textOf(n).includes("联系电话")
  );
  phoneCheck.props["onUpdate:modelValue"](true);
  const invalid = await view.options.hooks.validate(input(view));
  assert.equal(invalid.valid, false);
  assert.equal(invalid.issues[0].field, "phone");
  view.model.phone = "13800138000";
  assert.equal((await view.options.hooks.validate(input(view))).valid, true);
  assert.equal((await view.options.hooks.beforeSave(input(view))).proceed, false);
  find(view.root, (n) => n.tag === "ElCheckbox" && textOf(n).includes("我已核对")).props[
    "onUpdate:modelValue"
  ](true);
  assert.equal((await view.options.hooks.beforeSave(input(view))).proceed, true);
  view.close();
});

test("真实 edit：保留回显、字段快捷填写、联系人使用同一 binding、保存回调更新状态", async () => {
  const view = mount("edit");
  const prepared = await view.options.hooks.beforeOpen(input(view));
  assert.equal("defaults" in prepared, false);
  Object.assign(view.page.state, prepared.state);
  await view.options.hooks.afterOpen(input(view));
  assert.equal(view.page.state.loadedVersion, 2);
  view.page.state.requireShortName = true;
  assert.equal((await view.options.hooks.validate(input(view))).valid, false);
  view.button("采用客户名称前 30 字")();
  assert.equal(view.model.shortName, "示例客户");
  assert.equal((await view.options.hooks.validate(input(view))).valid, true);
  assert.equal(find(view.root, (n) => n.tag === "contacts").props.binding, view.binding);
  await view.options.hooks.afterSave(input(view, { entity: { customerCode: "KH002" } }));
  assert.equal(view.page.state.lastSavedCode, "KH002");
  view.close();
});

test("真实 detail：联系人本地筛选不改原数据，动作插槽打开只读卡片", async () => {
  const view = mount("detail");
  await view.options.hooks.afterOpen(input(view));
  assert.equal(view.page.state.loadCount, 1);
  find(view.root, (n) => n.tag === "ElInput").props["onUpdate:modelValue"]("不存在");
  await nextTick();
  assert.equal(find(view.root, (n) => n.tag === "contacts").props.rows.length, 0);
  assert.equal(view.model.contacts.length, 1);
  view.page.state.contactKeyword = "138";
  await nextTick();
  assert.equal(find(view.root, (n) => n.tag === "contacts").props.rows.length, 1);
  view.button("联系卡片")();
  await nextTick();
  assert.ok(find(view.root, (n) => n.tag === "dialog"));
  const prepared = await view.options.hooks.beforeOpen(input(view));
  assert.equal(prepared.state.cardOpen, false);
  view.close();
});

test("真实页面初始化与后置钩子拒绝已取消任务，不写页面 state", async () => {
  for (const name of ["index", "add", "edit", "detail"]) {
    const view = mount(name),
      controller = new AbortController();
    controller.abort();
    const cancelled = { ...input(view), signal: controller.signal };
    const hook = view.options.hooks.beforeOpen ?? view.options.hooks.afterQuery;
    await assert.rejects(() => hook(cancelled));
    assert.equal(view.page.state.queryCount ?? view.page.state.loadCount ?? 0, 0);
    view.close();
  }
});
