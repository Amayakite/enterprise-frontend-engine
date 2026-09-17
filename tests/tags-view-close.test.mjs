import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import "./reference-harness.mjs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "vue-router")
      return {
        url: "data:text/javascript,export const useRoute=()=>globalThis.__closeView.route;export const useRouter=()=>globalThis.__closeView.router;",
        shortCircuit: true,
      };
    if (specifier === "@/utils")
      return {
        url: "data:text/javascript,export const isExternal=(path)=>/^https?:/.test(path)",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { useTagsViewStore } = await import("../src/stores/tags-view.ts");
const add = "/base/customer/add";
const list = "/base/customer";
function setup() {
  setActivePinia(createPinia());
  const route = reactive({ path: add, fullPath: add });
  const events = [];
  let store;
  globalThis.__closeView = {
    route,
    router: {
      push: async (path) => {
        events.push({ path, cached: [...store.cachedViews] });
        route.path = path;
        route.fullPath = path;
      },
    },
  };
  store = useTagsViewStore();
  for (const path of [list, add])
    store.addView({ name: path, title: path, path, fullPath: path, keepAlive: true });
  return { store, route, events };
}
test("页内关闭移除固定标签和缓存，导航前缓存已失效，重开重新登记", async () => {
  const { store, events } = setup();
  let checks = 0;
  store.registerLeaveGuard(add, () => {
    checks++;
    return true;
  });
  assert.equal(await store.closeView(add, list), true);
  assert.equal(checks, 1);
  assert.deepEqual(events, [{ path: list, cached: [list] }]);
  assert.deepEqual(
    store.visitedViews.map((v) => v.fullPath),
    [list]
  );
  store.addView({ name: "add", title: "新增", path: add, fullPath: add, keepAlive: true });
  assert.ok(store.cachedViews.includes(add));
});
test("拒绝关闭保持标签与缓存，不导航", async () => {
  const { store, events } = setup();
  store.registerLeaveGuard(add, () => false);
  assert.equal(await store.closeView(add, list), false);
  assert.ok(store.cachedViews.includes(add));
  assert.equal(events.length, 0);
});
test("关闭后台固定实例不误关当前标签", async () => {
  const { store, route, events } = setup();
  route.path = list;
  route.fullPath = list;
  assert.equal(await store.closeView(add, list), true);
  assert.equal(route.fullPath, list);
  assert.equal(events.length, 0);
  assert.deepEqual(store.cachedViews, [list]);
});
test("导航失败恢复缓存并撤回离开许可", async () => {
  const { store } = setup();
  let rollbacks = 0;
  store.registerLeaveGuard(
    add,
    () => true,
    () => {
      rollbacks++;
    }
  );
  globalThis.__closeView.router.push = async () => ({ type: 4 });
  assert.equal(await store.closeView(add, list), false);
  assert.ok(store.cachedViews.includes(add));
  assert.ok(store.visitedViews.some((v) => v.fullPath === add));
  assert.equal(rollbacks, 1);
});
