import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { reactive, effectScope } from "vue";
import "./reference-harness.mjs";

// 此测试检查工厂传给组件的公开 props；不声称覆盖浏览器 DOM 或 SFC 渲染。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "vue-router")
      return {
        url: "data:text/javascript,export const useRoute=()=>globalThis.__businessPageTest.route;export const useRouter=()=>globalThis.__businessPageTest.router;",
        shortCircuit: true,
      };
    if (specifier === "@/stores/tags-view")
      return {
        url: "data:text/javascript,export const useTagsViewStore=()=>globalThis.__businessPageTest.tags;",
        shortCircuit: true,
      };
    if (specifier === "@/stores/user")
      return {
        url: "data:text/javascript,export const useUserStore=()=>globalThis.__businessPageTest.user;",
        shortCircuit: true,
      };
    if (specifier.endsWith(".vue"))
      return {
        url: "data:text/javascript,export default {};",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

const { createBusinessPaths } = await import("../src/components/business/crud/page.ts");
const { createQueryReference } = await import("../src/components/business/search/reference.ts");
const { useBusinessPage } = await import("../src/composables/useBusinessPage.ts");

test("页面固定实体身份，组织/权限范围响应更新，导航可单独覆盖", async () => {
  const calls = [];
  const route = reactive({ params: { id: "C001" }, fullPath: "/base/customer/edit/C001" });
  const user = reactive({ userInfo: { userId: 0, perms: ["read"] } });
  globalThis.__businessPageTest = {
    route,
    user,
    tags: {
      closeView: async (fullPath, fallback) => {
        calls.push(["close", fullPath, fallback]);
        return true;
      },
    },
    router: {
      push: async (path) => calls.push(["push", path]),
      replace: async (path) => calls.push(["replace", path]),
    },
  };
  const organization = reactive({ id: "org-a" });
  const scope = effectScope();
  try {
    const page = scope.run(() =>
      useBusinessPage({
        meta: { key: "customer" },
        page: {
          basePath: "/base/customer",
          organizationId: () => organization.id,
        },
      })
    );
    const first = page.context.value.scopeKey;
    route.params.id = "C002";
    route.fullPath = "/base/customer/edit/C002";
    assert.equal(page.entityId, "C001");
    assert.equal(page.draftIdentity().instanceKey, "/base/customer/edit/C001");
    assert.equal(page.draftIdentity().userId, 0);
    organization.id = "org-b";
    assert.notEqual(page.context.value.scopeKey, first);
    assert.equal(page.preference.value.scope, page.context.value.scopeKey);
    assert.equal(page.draftIdentity().tenantId, "org-b");
    await page.navigation.saved("C001");
    await page.navigation.close();
    assert.deepEqual(calls, [
      ["replace", "/base/customer/detail/C001"],
      ["close", "/base/customer/edit/C001", "/base/customer"],
    ]);
    const custom = scope.run(() =>
      useBusinessPage(
        {
          meta: { key: "customer" },
          page: {
            basePath: "/base/customer",
            organizationId: "org-a",
          },
        },
        { saved: async (id) => calls.push(["custom", id]) }
      )
    );
    await custom.navigation.saved("C003");
    await custom.navigation.add();
    assert.deepEqual(calls.slice(-2), [
      ["custom", "C003"],
      ["push", "/base/customer/add"],
    ]);
  } finally {
    scope.stop();
    delete globalThis.__businessPageTest;
  }
});

test("公共路径处理尾斜杠、0 和特殊 ID，不允许 query/hash 混入配置", () => {
  const paths = createBusinessPaths("/base/customer/");
  assert.equal(paths.list, "/base/customer");
  assert.equal(paths.add, "/base/customer/add");
  assert.equal(paths.detail(0), "/base/customer/detail/0");
  assert.equal(paths.edit("a/b ?"), "/base/customer/edit/a%2Fb%20%3F");
  for (const bad of ["", "/", "relative", "/base?a=1", "/base#x"]) {
    assert.throws(() => createBusinessPaths(bad));
  }
});

test("查询参照继承页面范围，自定义范围只追加；缺少范围明确失败", () => {
  const source = { key: "test", getKey: (row) => row.id, getLabel: (row) => row.name };
  const props = {
    value: null,
    multiple: false,
    disabled: false,
    change() {},
    scopeKey: "user-a:org-a",
  };
  const editor = createQueryReference({ source, filters: () => ({}) });
  const first = editor.render(props);
  assert.equal(first.props.scopeKey, JSON.stringify([props.scopeKey]));
  const second = editor.render({ ...props, scopeKey: "user-b:org-a" });
  assert.notEqual(first.props.scopeKey, second.props.scopeKey);
  assert.throws(() => editor.render({ ...props, scopeKey: undefined }), /缺少/);
  const custom = createQueryReference({ source, filters: () => ({}), scopeKey: () => "province" });
  assert.equal(custom.render(props).props.scopeKey, JSON.stringify([props.scopeKey, "province"]));
});

test("customer add/edit 独立装配且不再监听全局路由，子表沿用公共绑定", () => {
  for (const mode of ["add", "edit"]) {
    const text = fs.readFileSync(`src/pages/base/customer/${mode}.vue`, "utf8");
    assert.match(text, /<MyCrud(?:List|Form|Detail)/);
    assert.match(text, /useCrudView\(customerModule/);
    assert.match(text, new RegExp(`view: "${mode}"`));
    assert.doesNotMatch(text, /CustomerEditor|useRoute|watch\(/);
  }
  const binding = fs.readFileSync("src/components/business/crud/aggregate.ts", "utf8");
  assert.match(binding, /useCrudTableChild/);
  assert.equal(fs.existsSync("src/pages/base/customer/CustomerEditor.vue"), false);
});
