import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";
import { createRenderer, h, reactive, markRaw } from "vue";
import { flush, pending } from "./reference-harness.mjs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/") && specifier.endsWith(".vue"))
      return {
        url: new URL(`../src/${specifier.slice(2)}`, import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("MyReference/index.vue"))
      return { format: "module", source: "export default {};", shortCircuit: true };
    if (url.endsWith(".vue")) {
      const filename = fileURLToPath(url);
      const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
      const script = compileScript(descriptor, { id: "m4-display", inlineTemplate: true });
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(
          `import { inject, computed, ref, watch, onBeforeUnmount } from 'vue';\n${script.content}`,
          { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }
        ).outputText,
      };
    }
    return next(url, context);
  },
});
const { createReferenceField } = await import("../src/components/business/fields/reference.ts");
const { default: ReferenceDisplay } =
  await import("../src/components/business/fields/ReferenceDisplay.vue");
const { createReferenceDisplayContext, referenceDisplayKey } =
  await import("../src/components/business/fields/reference-display.ts");
function remove(node) {
  const list = node.parent?.children;
  if (list) {
    const index = list.indexOf(node);
    if (index >= 0) list.splice(index, 1);
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
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
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
function mount(initial) {
  const props = reactive(initial),
    root = { children: [] },
    context = createReferenceDisplayContext();
  const app = renderer.createApp({ setup: () => () => h(ReferenceDisplay, props) });
  app.component("ElButton", {
    setup:
      (_, { attrs, slots }) =>
      () =>
        h("button", attrs, slots.default?.()),
  });
  app.provide(referenceDisplayKey, context);
  app.mount(root);
  return {
    props,
    root,
    context,
    text: () => textOf(root),
    close: () => {
      app.unmount();
      context.dispose();
    },
  };
}
test("R01/R08 表格展示值或范围切换后，无法取消的旧回显也不能覆盖新标签", async () => {
  const old = pending(),
    later = pending();
  const t = mount({ owner: markRaw({}), requestKey: "old", load: () => old.promise });
  await flush();
  t.props.load = () => later.promise;
  t.props.requestKey = "new";
  await flush();
  later.resolve("新商品");
  await flush();
  assert.equal(t.text(), "新商品");
  old.resolve("旧商品");
  await flush();
  assert.equal(t.text(), "新商品");
  const stale = pending();
  t.props.load = () => stale.promise;
  t.context.reset();
  await flush();
  t.props.load = async () => "新组织商品";
  t.context.reset();
  await flush();
  stale.resolve("旧组织商品");
  await flush();
  assert.equal(t.text(), "新组织商品");
  t.close();
});
test("source 对象变更即使 ID/范围字符串相同也重新回显", async () => {
  const t = mount({ owner: markRaw({}), requestKey: "same", load: async () => "旧 source" });
  await flush();
  t.props.load = async () => "新 source";
  t.props.owner = markRaw({});
  await flush();
  assert.equal(t.text(), "新 source");
  t.close();
});
test("行卸载后迟到失败不更新 UI 或产生未处理异常", async () => {
  const wait = pending();
  const t = mount({ owner: markRaw({}), requestKey: "row", load: () => wait.promise });
  await flush();
  t.close();
  wait.reject(new Error("迟到失败"));
  await flush();
  assert.equal(t.root.children.length, 0);
});
test("同 source/条件展示合并 ID，不同范围隔离，批量返回仅映射自己的值", async () => {
  const requests = [];
  const source = {
    key: "test",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    resolve: async (ids, filters, { signal }) => {
      requests.push({ ids, filters, signal });
      return { items: ids.map((id) => ({ id, name: `${typeof id}:${id}` })), unavailableIds: [] };
    },
  };
  const adapter = createReferenceField()({
    source,
    filters: ({ context }) => ({ organizationId: context.organization }),
    scopeKey: ({ context }) => context.organization,
  });
  const env = (organization) => ({ model: {}, context: { organization }, mode: "edit" });
  const context = createReferenceDisplayContext();
  const result = await Promise.all([
    adapter.display(0, env("a")).props.load(context),
    adapter.display("0", env("a")).props.load(context),
    adapter.display(0, env("b")).props.load(context),
  ]);
  assert.deepEqual(result, ["number:0", "string:0", "number:0"]);
  assert.deepEqual(
    requests.map((r) => r.ids),
    [[0, "0"], [0]]
  );
  const signal = requests[0].signal;
  context.reset();
  assert.equal(signal.aborted, true);
  context.dispose();
});
test("R11 失效记录展示明确错误，重试成功恢复标签", async () => {
  const t = mount({
    owner: markRaw({}),
    requestKey: "bad",
    load: async () => {
      throw new Error("参照已失效");
    },
  });
  await flush();
  assert.match(t.text(), /参照已失效/);
  t.props.load = async () => "恢复商品";
  await flush();
  function button(node) {
    return node.tag === "button" ? node : (node.children ?? []).map(button).find(Boolean);
  }
  button(t.root).props.onClick();
  await flush();
  assert.equal(t.text(), "恢复商品");
  t.close();
});
test("R03 工厂展示合法回显的禁用历史记录，但保存校验仍拒绝它", async () => {
  const context = createReferenceDisplayContext();
  const source = {
    key: "test",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    resolve: async (ids) => ({
      items: ids.filter((id) => id !== "missing").map((id) => ({ id, name: "禁用商品" })),
      unavailableIds: ids.filter((id) => id === "missing"),
    }),
    selectable: () => ({ allowed: false, reason: "已禁用" }),
  };
  const adapter = createReferenceField()({
    source,
    filters: () => ({}),
    scopeKey: () => "a",
    navigation: { view: (id) => ({ target: "customer", id }) },
  });
  const env = { model: {}, context: {}, mode: "edit" };
  await assert.rejects(adapter.display("missing", env).props.load(context), /记录不可用/);
  assert.deepEqual(await adapter.display("disabled", env).props.load(context), [
    { id: "disabled", label: "禁用商品", target: { target: "customer", id: "disabled" } },
  ]);
  const validation = await adapter.validate("disabled", env, {
    run: async (_owner, _key, ids, resolve) => resolve(ids),
  });
  assert.deepEqual(validation, { allowed: false, reason: "参照值已失效或不可选择" });
  context.dispose();
});
