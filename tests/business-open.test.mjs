import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, createRenderer, h, provide } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import "./reference-harness.mjs";
const { resolveBusinessPresentation } = await import("../src/components/business/crud/page.ts");
const { useBusinessPresentation } = await import("../src/composables/useBusinessPresentation.ts");
const { useBusinessOpen } = await import("../src/composables/useBusinessOpen.ts");
const { embeddedEditorKey } = await import("../src/components/business/crud/presentation.ts");
const { getBusinessCompletion, releaseBusinessCompletion } =
  await import("../src/router/business-completion.ts");
const loader = async () => ({ default: {} });
const page = {
  basePath: "/test",
  organizationId: "a",
  presentation: { mode: "drawer", detail: { mode: "tab" } },
  components: { add: loader, edit: loader, detail: loader },
};
const target = { key: "test", title: "测试", list: "/test", page, matches: () => true };
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
async function mount(embedded) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ["/source", "/test", "/test/add", "/test/edit/:id", "/test/detail/:id"].map((path) => ({
      path,
      component: {},
    })),
  });
  await router.push("/source");
  let api, host;
  const child = {
    setup() {
      host = useBusinessPresentation("/source", "来源");
      api = useBusinessOpen(host);
      return () => h("div");
    },
  };
  const app = renderer.createApp({
    setup() {
      if (embedded) provide(embeddedEditorKey, embedded);
      return () => h(child);
    },
  });
  app.use(router);
  app.mount({});
  return { api, host, router, close: () => app.unmount() };
}

test("展示解析遵循单次、场景、公共优先级，并保留旧配置兼容", () => {
  assert.equal(resolveBusinessPresentation(page, "add").mode, "drawer");
  assert.equal(resolveBusinessPresentation(page, "detail").mode, "tab");
  assert.equal(resolveBusinessPresentation(page, "detail", { mode: "dialog" }).mode, "dialog");
  assert.equal(
    resolveBusinessPresentation(
      {
        ...page,
        presentation: undefined,
        components: undefined,
        add: { mode: "dialog", component: loader },
      },
      "add"
    ).component,
    loader
  );
  assert.equal(
    resolveBusinessPresentation({ ...page, presentation: undefined }, "detail").mode,
    "tab"
  );
});

test("跨模块新增直接打开目标容器，ID 0 的详情按覆盖走路由", async () => {
  const view = await mount();
  assert.equal(await view.api.openPage(target, { target: "test", view: "add" }), true);
  assert.equal(view.router.currentRoute.value.path, "/source");
  assert.equal(view.host.current.context.instanceKey, "/test/add");
  assert.equal(view.host.current.mode, "drawer");
  await view.api.openPage(target, { target: "test", view: "detail", id: 0 });
  assert.equal(view.router.currentRoute.value.path, "/test/detail/0");
  view.close();
});

test("tab 新增直达 add，保存回调与来源生命周期隔离", async () => {
  const view = await mount();
  let saved;
  await view.api.openPage(target, {
    target: "test",
    view: "add",
    mode: "tab",
    completion: "return-to-source",
    onSaved: async (id) => {
      saved = id;
    },
  });
  const route = view.router.currentRoute.value;
  assert.equal(route.path, "/test/add");
  const completion = getBusinessCompletion(route.query.businessSession);
  assert.equal(completion.source, "/source");
  await completion.saved("0");
  assert.equal(saved, "0");
  view.close();
  assert.equal(getBusinessCompletion(route.query.businessSession), undefined);
  await completion.saved("late");
  assert.equal(saved, "0");
});

test("两层容器后转路由；未知路由或缺失 ID 不加载目标", async () => {
  const scope = effectScope();
  const parent = scope.run(() => useBusinessPresentation("/other", "其他"));
  await parent.open({ mode: "add" }, { mode: "dialog", depth: 2, component: loader });
  const view = await mount(parent.current.context);
  await view.api.openPage(target, { target: "test", view: "add" });
  assert.equal(view.host.current, null);
  assert.equal(view.router.currentRoute.value.path, "/test/add");
  await assert.rejects(view.api.openPage(target, { target: "test", view: "edit" }), /ID/);
  await assert.rejects(
    view.api.openPage(
      { ...target, page: { ...page, basePath: "/missing" } },
      { target: "test", view: "add" }
    ),
    /无法访问/
  );
  view.close();
  scope.stop();
});

test("详情切编辑下载失败保留原实例，旧实例的迟到保存不能关闭新页面", async () => {
  const scope = effectScope();
  const host = scope.run(() => useBusinessPresentation("/test", "测试"));
  await host.open({ mode: "detail", id: "1" }, { mode: "drawer", component: loader });
  const original = host.current;
  await assert.rejects(
    host.open(
      { mode: "edit", id: "1" },
      {
        mode: "drawer",
        component: async () => {
          throw new Error("离线");
        },
      }
    ),
    /离线/
  );
  assert.equal(host.current, original);
  await host.open({ mode: "edit", id: "1" }, { mode: "drawer", component: loader });
  const editor = host.current;
  await original.context.saved("1");
  assert.equal(host.current, editor);
  await original.context.close();
  assert.equal(host.current, editor);
  scope.stop();
});

test("补充容器拒绝离开时，父表单不能关闭，并撤销临时许可", async () => {
  const scope = effectScope();
  const host = scope.run(() => useBusinessPresentation("/test", "测试"));
  await host.open({ mode: "add" }, { mode: "dialog", component: loader });
  let rollback = 0;
  host.current.context.register({
    canLeave: async () => true,
    cancelLeaveApproval: () => rollback++,
  });
  host.current.context.register({ canLeave: async () => false, cancelLeaveApproval() {} });
  await host.close();
  assert.ok(host.current);
  assert.equal(rollback, 1);
  scope.stop();
});
