import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRenderer, h, reactive, markRaw, nextTick } from "vue";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/"))
      return next(pathToFileURL(resolve("src", `${specifier.slice(2)}.ts`)).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier))
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { useReference } = await import("../src/components/business/MyReference/useReference.ts");
export const { checkReferenceResolve, checkReferencePage } =
  await import("../src/components/business/MyReference/contract.ts");
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
export const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
export const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
};
export function mount(overrides = {}) {
  const events = [];
  const source = {
    key: "test",
    title: "客户",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    columns: [],
    search: async () => ({ list: [], total: 0 }),
    resolve: async (ids) => ({
      items: ids.map((id) => ({ id, name: `客户${id}` })),
      unavailableIds: [],
    }),
  };
  const props = reactive({
    source: markRaw(source),
    modelValue: null,
    filters: { organizationId: "a" },
    scopeKey: "a",
    debounceMs: 60000,
    ...overrides,
  });
  let state;
  const app = renderer.createApp({
    setup() {
      state = useReference(props, {
        update: (value) => {
          events.push(["update", value]);
          props.modelValue = value;
        },
        commit: (value) => events.push(["commit", value]),
        resolve: (value) => events.push(["resolve", value]),
        error: (value) => events.push(["error", value]),
        open: (value) => events.push(["open", value]),
      });
      return () => h("div");
    },
  });
  app.mount({});
  return { props, state, events, close: () => app.unmount() };
}
