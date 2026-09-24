import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";
import { createRenderer, defineComponent, h, reactive } from "vue";
import { flush, pending } from "./reference-harness.mjs";

// 编译真实 SFC，仅替换网络及 Element Plus 外壳；不复制组件中的更新逻辑。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "element-plus") return { url: "test:element-plus", shortCircuit: true };
    if (specifier === "@/stores/dict") return { url: "test:dict-store", shortCircuit: true };
    if (specifier === "@/api/file") return { url: "test:file-api", shortCircuit: true };
    if (specifier.startsWith("@/") && specifier.endsWith(".vue"))
      return {
        url: new URL(`../src/${specifier.slice(2)}`, import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "test:element-plus")
      return {
        format: "module",
        source: "let id = 0; export const genFileId = () => ++id;",
        shortCircuit: true,
      };
    if (url === "test:dict-store")
      return {
        format: "module",
        source: "export const useDictStore = () => globalThis.__m3Dictionary;",
        shortCircuit: true,
      };
    if (url === "test:file-api")
      return {
        format: "module",
        source:
          "export default { delete: async () => {}, upload: (...args) => globalThis.__m3Upload ? globalThis.__m3Upload(...args) : Promise.resolve({ name: '图片', url: '/new.png' }) };",
        shortCircuit: true,
      };
    // 本组验证上传回写与取消；预览弹窗的 DOM/解析器由浏览器交互验证。
    if (url.endsWith("MyReference/index.vue") || url.endsWith("FilePreviewDialog.vue"))
      return { format: "module", source: "export default {};", shortCircuit: true };
    if (url.endsWith(".vue")) {
      const filename = fileURLToPath(url);
      const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
      const script = compileScript(descriptor, { id: "m3-test", inlineTemplate: true });
      const source = ts.transpileModule(
        `import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue';\n${script.content}`,
        { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }
      ).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { feedbackNotices, clearFeedback } = await import("../src/utils/feedback.ts");
afterEach(clearFeedback);
const { default: MultiImageUpload } =
  await import("../src/components/common/Upload/MultiImageUpload.vue");
const { default: FileUpload } = await import("../src/components/common/Upload/FileUpload.vue");
const { default: SingleImageUpload } =
  await import("../src/components/common/Upload/SingleImageUpload.vue");
const { validateUpload } = await import("../src/components/common/Upload/useUpload.ts");

const { default: DictSelect } = await import("../src/components/business/DictSelect.vue");
const { createDictionaryPool } = await import("../src/utils/dictionary-pool.ts");

const { createReferenceField } = await import("../src/components/business/fields/reference.ts");
const { createReferenceValidationBatch } =
  await import("../src/components/business/fields/validation.ts");
function removeNode(node) {
  const children = node.parent?.children;
  if (children) {
    const index = children.indexOf(node);
    if (index >= 0) children.splice(index, 1);
  }
  node.parent = null;
}
const renderer = createRenderer({
  createElement: () => ({ children: [] }),
  createText: () => ({ children: [] }),
  createComment: () => ({ children: [] }),
  insert(node, parent, anchor) {
    removeNode(node);
    parent.children ??= [];
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
    node.parent = parent;
  },
  remove: removeNode,
  setText() {},
  setElementText() {},
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp() {},
});
function mount(component, initialProps) {
  const props = reactive(initialProps);
  const events = [];
  let control;
  let controlEmit;
  let aborts = 0;
  const stub = defineComponent({
    props: [
      "modelValue",
      "fileList",
      "onSuccess",
      "onError",
      "httpRequest",
      "beforeUpload",
      "loading",
    ],
    emits: ["update:fileList", "change"],
    setup(props, { emit, expose, slots }) {
      control = props;
      controlEmit = emit;
      expose({ abort: () => aborts++ });
      return () => h("div", slots.default?.());
    },
  });
  const app = renderer.createApp({
    setup() {
      return () =>
        h(component, {
          ...props,
          "onUpdate:modelValue": (value) => {
            events.push(value);
            props.modelValue = value;
          },
        });
    },
  });
  for (const name of ["ElUpload", "ElSelect", "ElRadioGroup", "ElCheckboxGroup"])
    app.component(name, stub);
  for (const name of [
    "ElOption",
    "ElRadio",
    "ElCheckbox",
    "ElTag",
    "ElIcon",
    "ElText",
    "ElButton",
    "Plus",
    "Delete",
    "ZoomIn",
    "ElImageViewer",
    "ElImage",
    "ElProgress",
    "Document",
  ])
    app.component(name, {
      setup:
        (_props, { slots }) =>
        () =>
          h("span", slots.default?.()),
    });
  app.mount({});
  return {
    props,
    events,
    control: () => control,
    emitControl: (...args) => controlEmit(...args),
    aborts: () => aborts,
    close: () => app.unmount(),
  };
}

test("多图上传成功发出新数组，hydrate/reset 同步显示并隔离未完成文件", async () => {
  const original = ["/old.png"];
  const ctx = mount(MultiImageUpload, { modelValue: original });
  await flush();
  assert.equal(ctx.control().fileList[0].url, "/old.png");
  ctx.emitControl("update:fileList", [
    ...ctx.control().fileList,
    { name: "新图片", uid: 123, status: "uploading" },
  ]);
  await flush();
  ctx.control().onSuccess({ name: "新图片", url: "/new.png" }, { uid: 123 });
  await flush();
  assert.deepEqual(original, ["/old.png"]);
  assert.deepEqual(ctx.props.modelValue, ["/old.png", "/new.png"]);
  assert.equal(ctx.events.length, 1);
  ctx.props.modelValue = [];
  await flush();
  assert.deepEqual(ctx.control().fileList, []);
  assert.ok(ctx.aborts() >= 1);
  ctx.props.modelValue = ["/loaded.png"];
  await flush();
  assert.equal(ctx.control().fileList[0].url, "/loaded.png");
  assert.equal(ctx.events.length, 1);
  ctx.close();
});

test("字典切码丢弃迟到显示、空值清除且加载失败不产生未处理异常", async () => {
  const old = pending();
  globalThis.__m3Dictionary = createDictionaryPool(async (code) => {
    if (code === "old") await old.promise;
    if (code === "fail") throw new Error("失败");
    return [{ label: code, value: code === "old" ? 1 : "2" }];
  });
  const ctx = mount(DictSelect, { code: "old", modelValue: 2 });
  await flush();
  assert.equal(ctx.control().loading, true);
  ctx.props.code = "new";
  await flush();
  old.resolve();
  await flush();
  assert.equal(ctx.control().modelValue, "2");
  assert.equal(ctx.events.length, 0);
  ctx.props.modelValue = null;
  await flush();
  assert.equal(ctx.control().modelValue, undefined);
  ctx.props.code = "fail";
  await new Promise((resolve) => setImmediate(resolve));
  await flush();
  assert.equal(ctx.control().loading, false);
  ctx.props.code = "new";
  ctx.props.modelValue = 2;
  await new Promise((resolve) => setImmediate(resolve));
  await flush();
  assert.equal(ctx.control().modelValue, "2");
  ctx.close();
});

test("参照适配只从 commit 映射，验证同源同范围批量且强制复查", async () => {
  const requests = [];
  const source = {
    key: "test",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    resolve: async (ids) => {
      requests.push(ids);
      return { items: ids.map((id) => ({ id, name: `客户${id}` })), unavailableIds: [] };
    },
  };
  const adapter = createReferenceField()({
    source,
    filters: () => ({ organizationId: "a" }),
    scopeKey: () => "a",
    map: (event) => ({ name: event.items[0]?.name ?? "" }),
  });
  const env = { model: {}, context: {}, mode: "add" };
  const changes = [];
  const vnode = adapter.render(0, env, false, (...args) => changes.push(args));
  assert.equal(vnode.props["onUpdate:modelValue"], undefined);
  assert.equal(vnode.props.onResolve, undefined);
  vnode.props.onCommit({ value: 0, items: [{ id: 0, name: "客户0" }], reason: "select" });
  assert.deepEqual(changes, [[0, { name: "客户0" }, "user"]]);
  const batch = createReferenceValidationBatch();
  const results = await Promise.all([
    adapter.validate(0, env, batch),
    adapter.validate(2, env, batch),
  ]);
  assert.deepEqual(requests, [[0, 2]]);
  assert.ok(results.every((result) => result.allowed));
  await adapter.validate(0, env, createReferenceValidationBatch());
  assert.equal(requests.length, 2);
  const multiple = createReferenceField()({
    source,
    multiple: true,
    maxSelected: 1,
    filters: () => ({}),
    scopeKey: () => "a",
  });
  assert.equal(
    (await multiple.validate([0, 2], env, createReferenceValidationBatch())).allowed,
    false
  );
  assert.equal(
    (await multiple.validate([""], env, createReferenceValidationBatch())).allowed,
    false
  );
});

test("附件逐个成功回写，最后一项失败仍保留成功文件及其他在途文件", async () => {
  const original = [{ name: "原附件", url: "/old.pdf" }];
  const ctx = mount(FileUpload, { modelValue: original });
  await flush();
  ctx.emitControl("update:fileList", [
    ...ctx.control().fileList,
    { name: "A", uid: 801, status: "uploading" },
    { name: "B", uid: 802, status: "uploading" },
  ]);
  await flush();
  ctx.control().onSuccess({ name: "A", url: "/a.pdf" }, { uid: 801 });
  await flush();
  assert.deepEqual(ctx.props.modelValue, [...original, { name: "A", url: "/a.pdf" }]);
  assert.equal(ctx.control().fileList.find((file) => file.uid === 802).status, "uploading");
  ctx.control().onError(new Error("B 失败"));
  await flush();
  assert.equal(ctx.events.length, 1);
  assert.deepEqual(original, [{ name: "原附件", url: "/old.pdf" }]);
  assert.deepEqual(
    feedbackNotices.value.map(({ tone, message }) => ({ tone, message })),
    [{ tone: "success", message: "上传成功" }]
  );
  ctx.close();
});

test("三类上传在模型替换或卸载后取消请求，迟到成功不回写", async () => {
  for (const [component, initial, replacement] of [
    [FileUpload, [], [{ name: "新实体", url: "/other.pdf" }]],
    [MultiImageUpload, [], ["/other.png"]],
    [SingleImageUpload, "", "/other.png"],
  ]) {
    for (const unmount of [false, true]) {
      const task = pending();
      let signal;
      globalThis.__m3Upload = (_data, _progress, value) => {
        signal = value;
        return task.promise;
      };
      const ctx = mount(component, { modelValue: initial });
      await flush();
      const promise = ctx.control().httpRequest({
        file: Object.assign(new File(["x"], "a.png", { type: "image/png" }), { uid: 901 }),
      });
      if (unmount) ctx.close();
      else {
        ctx.props.modelValue = replacement;
        await flush();
      }
      assert.equal(signal.aborted, true);
      task.resolve({ name: "旧结果", url: "/late.png" });
      await assert.rejects(promise, (error) => error.code === "ERR_CANCELED");
      assert.equal(ctx.events.length, 0);
      if (!unmount) {
        assert.deepEqual(ctx.props.modelValue, replacement);
        ctx.close();
      }
    }
  }
  delete globalThis.__m3Upload;
});

test("上传元信息检查支持扩展名大小写、MIME 通配、空规则及大小上限", () => {
  const image = new File(["x"], "A.PNG", { type: "image/png" });
  for (const accept of [".PNG", "image/*", "*/*", "", "*"])
    assert.equal(validateUpload(image, { accept }), null);
  assert.match(validateUpload(image, { accept: ".pdf" }), /格式/);
  assert.match(validateUpload(image, { maxFileSize: 0 }), /大于 0/);
  assert.match(validateUpload(image, { name: " " }), /不能为空/);
  assert.match(
    validateUpload(new File([new Uint8Array(1025)], "large.pdf"), { maxFileSize: 1 / 1024 }),
    /不能大于/
  );
});
