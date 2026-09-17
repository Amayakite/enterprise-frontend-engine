import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import ts from "typescript";
import { parse, compileScript } from "vue/compiler-sfc";
import { createRenderer, defineComponent, h, nextTick, reactive } from "vue";
import "./reference-harness.mjs";
// 编译真实 SFC；补上 Vite 的自动导入，子组件作为事件边界替身。
registerHooks({
  load(url, context, next) {
    if (!url.endsWith(".vue")) return next(url, context);
    if (!url.endsWith("/Pagination.vue") && !url.endsWith("/MySearch.vue"))
      return {
        format: "module",
        shortCircuit: true,
        source: "export default { render: () => null }",
      };
    const file = fileURLToPath(url);
    const descriptor = parse(fs.readFileSync(file, "utf8"), { filename: file }).descriptor;
    const compiled = compileScript(descriptor, {
      id: "s2",
      inlineTemplate: true,
      fs: { fileExists: fs.existsSync, readFile: (f) => fs.readFileSync(f, "utf8") },
    }).content;
    const source = `import { ref, computed, watch, onBeforeUnmount } from 'vue';\n${compiled}`;
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
      }).outputText,
    };
  },
});
const Pagination = (await import("../src/components/common/Pagination.vue")).default;
const MySearch = (await import("../src/components/business/MySearch.vue")).default;
const renderer = createRenderer({
  createElement: () => ({ style: {} }),
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
test("S2 分页页大小联动只发一次事件，总数归零回首页", async () => {
  let control;
  const events = [];
  const props = reactive({ page: 3, limit: 10, total: 40 });
  const app = renderer.createApp({
    render: () =>
      h(Pagination, {
        ...props,
        "onUpdate:page": (v) => (props.page = v),
        "onUpdate:limit": (v) => (props.limit = v),
        onPagination: (v) => events.push(v),
      }),
  });
  app.component(
    "ElPagination",
    defineComponent({
      setup(_, ctx) {
        control = ctx.emit;
        return () => null;
      },
    })
  );
  app.mount({});
  control("update:page-size", 20);
  control("update:current-page", 2);
  await nextTick();
  await nextTick();
  assert.deepEqual(events, [{ page: 1, limit: 20 }]);
  control("update:current-page", 2);
  await nextTick();
  await nextTick();
  assert.equal(events.length, 2);
  assert.equal(props.page, 2);
  props.total = 0;
  await nextTick();
  await nextTick();
  await nextTick();
  assert.equal(events.length, 3);
  assert.deepEqual(events[2], { page: 1, limit: 20 });
  app.unmount();
});
test("S2 MySearch 两种模式不会互相要求另一模式的参数", () => {
  for (const props of [
    { fields: [], createInitialQuery: () => ({}), context: undefined },
    {
      mode: "query",
      schema: {},
      modelValue: { quick: [], normal: [], advanced: null },
      scopeKey: "a",
    },
  ]) {
    const warnings = [];
    const app = renderer.createApp({ render: () => h(MySearch, props) });
    app.config.warnHandler = (message) => warnings.push(message);
    app.mount({});
    app.unmount();
    assert.deepEqual(
      warnings.filter((message) => message.includes("Missing required prop")),
      []
    );
  }
});
