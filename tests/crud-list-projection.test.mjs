import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h } from "vue";
import { flush } from "./reference-harness.mjs";

globalThis.__crudProjectionPerm = () => true;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/utils/auth")
      return {
        url: "data:text/javascript,export const hasPerm = () => globalThis.__crudProjectionPerm();",
        shortCircuit: true,
      };
    if (specifier === "element-plus" && context.parentURL?.includes("/useCrud"))
      return {
        url: "data:text/javascript,export const ElMessageBox = {confirm: async () => 'confirm'};",
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});

const { useCrudList } = await import("../src/composables/useCrudList.ts");
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

test("列表动作复用行投影，刷新后更新并严格区分数字与字符串 ID", async () => {
  const rowCount = 1_000;
  let requestRevision = 0;
  let getKeyCalls = 0;
  let seenRow;
  let seenSelection;
  const rows = () => [
    { id: 0, name: requestRevision ? "zero-new" : "zero-old", payload: { tags: ["a"] } },
    { id: "0", name: "string-zero", payload: { tags: ["b"] } },
    ...Array.from({ length: rowCount - 2 }, (_, index) => ({
      id: index + 1,
      name: `row-${index + 1}`,
      payload: { tags: [String(index)] },
    })),
  ];
  const config = {
    getKey(row) {
      getKeyCalls++;
      return row.id;
    },
    columns: [{ key: "name", label: "名称" }],
    query: { initial: { quick: [], normal: [], advanced: null }, schema: {} },
    scope: () => ({ key: "org-a", value: {} }),
    toQuery: (request) => request,
    request: async () => ({ list: rows(), total: rowCount }),
    selection: "multiple",
    pageSize: rowCount,
    actions: [
      {
        key: "inspect-row",
        label: "检查行",
        location: "row",
        visible(context) {
          seenRow = context.row;
          return true;
        },
        execute: async () => ({ affectedKeys: [] }),
      },
      {
        key: "inspect-selection",
        label: "检查选择",
        location: "selection",
        visible(context) {
          seenSelection = context.selectedRows;
          return true;
        },
        execute: async () => ({ affectedKeys: [] }),
      },
    ],
  };
  const view = mount(() => useCrudList(config, () => ({})));
  await flush();

  view.state.select([0, "0"]);
  view.state.actionAvailability("inspect-row", 0);
  view.state.actionAvailability("inspect-selection");
  assert.equal(seenRow.name, "zero-old");
  assert.deepEqual(
    seenSelection.map((row) => row.name),
    ["zero-old", "string-zero"]
  );

  const stableCalls = getKeyCalls;
  for (let index = 0; index < 100; index++) {
    view.state.actionAvailability("inspect-row", 0);
    view.state.actionAvailability("inspect-selection");
  }
  assert.equal(getKeyCalls, stableCalls, "重复判断动作不应重新遍历并提取整页行键");

  requestRevision++;
  await view.state.refresh();
  view.state.actionAvailability("inspect-row", 0);
  assert.equal(seenRow.name, "zero-new", "刷新后行索引必须指向新快照");
  view.state.actionAvailability("inspect-row", "0");
  assert.equal(seenRow.name, "string-zero", "数字 0 与字符串 0 必须定位到不同记录");
  view.close();
});
