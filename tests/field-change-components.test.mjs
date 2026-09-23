import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, compileScript } from "vue/compiler-sfc";
import ts from "typescript";
import { createRenderer, defineComponent, h, reactive, nextTick } from "vue";
import "./reference-harness.mjs";

const moduleSource = (source) => ({ format: "module", shortCircuit: true, source });
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "async-validator") return next("async-validator/dist-web/index.js", context);
    if (specifier === "@/api/base/customer")
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier === "@/api/base/sale")
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier === "@/utils/request")
      return {
        url: "data:text/javascript,export default async () => { throw new Error('此测试不访问网络'); }",
        shortCircuit: true,
      };

    if (specifier.startsWith("@/") && specifier.endsWith(".vue"))
      return {
        url: new URL("../src/" + specifier.slice(2), import.meta.url).href,
        shortCircuit: true,
      };
    if (specifier === "@/stores/dict")
      return {
        url: "data:text/javascript,export const useDictStore = () => ({})",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith(".vue")) return next(url, context);
    if (url.endsWith("/MyReference/index.vue"))
      return moduleSource("export default globalThis.__fieldCommitReference;");
    if (
      !url.endsWith("/MyForm/index.vue") &&
      !url.endsWith("/MyForm/MyFormField.vue") &&
      !url.endsWith("/fields/FieldInput.vue")
    )
      return moduleSource("export default { render: () => null };");
    const filename = fileURLToPath(url);
    const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
    const compiled = compileScript(descriptor, { id: filename, inlineTemplate: true });
    return moduleSource(
      ts.transpileModule(
        (url.endsWith("/MyForm/MyFormField.vue")
          ? ""
          : "import { computed, ref, shallowRef, watch } from 'vue';\n") + compiled.content,
        { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }
      ).outputText
    );
  },
});
let input, reference, fieldSlot;
globalThis.ElInput = defineComponent({
  setup(_, { attrs }) {
    input = attrs;
    return () => h("input");
  },
});
globalThis.__fieldCommitReference = defineComponent({
  setup(_, { attrs }) {
    reference = attrs;
    return () => h("reference");
  },
});
const MyForm = (await import("../src/components/business/MyForm/index.vue")).default;
const MyFormField = (await import("../src/components/business/MyForm/MyFormField.vue")).default;
const { createReferenceField } = await import("../src/components/business/fields/reference.ts");
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
function mount(custom = false, referenceOptions = {}) {
  let exposed;
  const initial = () => ({
    name: "",
    refId: referenceOptions.multiple ? [] : null,
    refName: "",
    dependent: "",
  });
  const model = reactive({ value: { ...initial(), dependent: "旧值" } });
  const events = [],
    order = [],
    warnings = [];
  const source = { key: "field-commit", getKey: (row) => row.id, getLabel: (row) => row.name };
  const referenceField = createReferenceField()({
    source,
    multiple: referenceOptions.multiple,
    filters: () => ({}),
    scopeKey: () => "fixed",
    map: referenceOptions.map ?? ((event) => ({ refName: event.items[0]?.name ?? "" })),
  });
  const app = renderer.createApp({
    render: () =>
      h(
        MyForm,
        {
          ref: (instance) => {
            exposed = instance;
          },
          modelValue: model.value,
          context: {},
          createInitialModel: initial,
          fields: [
            { key: "name", label: "名称", type: "text", form: { required: true } },
            { key: "refId", label: "参照", type: "reference", form: {}, reference: referenceField },
          ],
          links: [{ watch: ["refId"], writes: ["dependent"], clear: ["dependent"] }],
          "onUpdate:modelValue": (value) => {
            model.value = value;
            order.push("model");
          },
          change: (event) => {
            events.push(event);
            order.push("change");
          },
        },
        custom === "layout"
          ? { default: ({ field }) => h("section", [h(MyFormField, field("name"))]) }
          : custom === "missing"
            ? { default: () => h("div") }
            : custom
              ? {
                  "field-name": (cell) => {
                    fieldSlot = cell;
                    return h("custom");
                  },
                }
              : undefined
      ),
  });
  const shell = defineComponent({
    setup(_, { slots, expose }) {
      expose({ clearValidate() {}, validateField: async () => {} });
      return () => h("div", slots.default?.());
    },
  });
  app.component("ElForm", shell);
  app.component("ElFormItem", shell);
  app.config.warnHandler = (message) => warnings.push(message);
  app.mount({});
  return {
    model,
    validate: () => exposed.validate(),
    events,
    order,
    close() {
      app.unmount();
      assert.deepEqual(warnings, []);
    },
  };
}
test("真实 FieldInput/MyForm：文本 update 实时回写，原生 change 才通知完成", async () => {
  const view = mount();
  input["onUpdate:modelValue"]("输");
  await nextTick();
  input["onUpdate:modelValue"]("输入完成");
  await nextTick();
  assert.equal(view.model.value.name, "输入完成");
  assert.equal(view.events.length, 0);
  input.onChange("输入完成");
  assert.equal(view.events.length, 1);
  assert.equal(view.events[0].previous.name, "");
  assert.equal(view.events[0].model.name, "输入完成");
  input.onChange("输入完成");
  assert.equal(view.events.length, 1);
  view.close();
});
test("真实参照适配器完成主 ID、名称 map 和 links 后才发 change", () => {
  const view = mount();
  reference.onCommit({ value: 0, items: [{ id: 0, name: "完整回填" }], reason: "select" });
  assert.deepEqual(view.order, ["model", "change"]);
  assert.equal(view.events.length, 1);
  assert.equal(view.events[0].field, "refId");
  assert.equal(view.events[0].model.refId, 0);
  assert.equal(view.events[0].model.refName, "完整回填");
  assert.equal(view.events[0].model.dependent, "");
  view.close();
});

test("参照 map 不能改写不同主 ID，但复制出的等值多选数组可以通过", () => {
  const conflicting = mount(false, { map: () => ({ refId: "other" }) });
  assert.throws(
    () =>
      reference.onCommit({
        value: "selected",
        items: [{ id: "selected", name: "完整回填" }],
        reason: "select",
      }),
    /参照回写不能覆盖主 ID：refId/
  );
  conflicting.close();

  const equalArray = mount(false, {
    multiple: true,
    map: (event) => ({
      refId: [...event.value],
      refName: event.items.map((item) => item.name).join("、"),
    }),
  });
  reference.onCommit({
    value: ["C-1", "C-2"],
    items: [
      { id: "C-1", name: "甲" },
      { id: "C-2", name: "乙" },
    ],
    reason: "select",
  });
  assert.deepEqual(equalArray.model.value.refId, ["C-1", "C-2"]);
  assert.equal(equalArray.model.value.refName, "甲、乙");
  assert.equal(equalArray.events.length, 1);
  equalArray.close();
});

test("真实自定义字段插槽显式 setValue/commit，不遗漏或重复完成通知", () => {
  const view = mount(true);
  fieldSlot.setValue("自定义输入");
  assert.equal(view.events.length, 0);
  fieldSlot.commit();
  assert.equal(view.events.length, 1);
  assert.equal(view.events[0].model.name, "自定义输入");
  fieldSlot.commit();
  assert.equal(view.events.length, 1);
  view.close();
});

test("真实 customer 配置将地区 ID/名称一起回填，编辑换上级时不保留旧下级", async () => {
  const { customerModule } = await import("../src/pages/base/customer/config.ts");
  const { createCustomerForm } = await import("../src/pages/base/customer/adapters.ts");
  const { compileLinks } = await import("../src/components/business/fields/links.ts");
  const runtime = customerModule.createViewConfig({});
  const applyLinks = compileLinks(customerModule.links);
  let model = {
    ...createCustomerForm(),
    provinceId: "310000",
    provinceName: "上海市",
    cityId: "310100",
    cityName: "上海市",
    districtId: "310115",
    districtName: "浦东新区",
  };
  function select(key, id, name) {
    const field = runtime.form.fields.find((item) => item.key === key);
    assert.equal(field.type, "reference");
    const env = {
      model,
      context: { organizationId: "org-a", scopeKey: "customer-test" },
      mode: "edit",
    };
    const vnode = field.reference.render(model[key], env, false, (value, mapped, reason) => {
      // 实际 MyCrudForm 的初值入口读取当前模型，地区业务清空不能依赖旧初值。
      model = applyLinks(env, model, { ...mapped, [key]: value }, reason).model;
    });
    vnode.props.onCommit({
      value: id,
      items: id === null ? [] : [{ id, name }],
      reason: id === null ? "clear" : "select",
    });
  }
  select("provinceId", "320000", "江苏省");
  assert.equal(model.provinceName, "江苏省");
  assert.equal(model.cityId, null);
  assert.equal(model.cityName, "");
  assert.equal(model.districtId, null);
  assert.equal(model.districtName, "");
  select("cityId", "320100", "南京市");
  select("districtId", "320102", "玄武区");
  assert.deepEqual(
    [model.provinceName, model.cityName, model.districtName],
    ["江苏省", "南京市", "玄武区"]
  );
  select("cityId", null, "");
  assert.deepEqual([model.provinceId, model.cityId, model.districtId], ["320000", null, null]);
  assert.deepEqual([model.provinceName, model.cityName, model.districtName], ["江苏省", "", ""]);
  select("provinceId", null, "");
  assert.equal(model.provinceId, null);
  assert.equal(model.provinceName, "");
});

test("自由字段布局复用同一模型和 change，未渲染的必填字段仍校验", async () => {
  const view = mount("layout");
  input["onUpdate:modelValue"]("自定义布局");
  await nextTick();
  input.onChange("自定义布局");
  assert.equal(view.model.value.name, "自定义布局");
  assert.equal(view.events.length, 1);
  const validation = await view.validate();
  assert.equal(validation.valid, true, JSON.stringify(validation));
  view.close();
  const missing = mount("missing");
  const result = await missing.validate();
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].field, "name");
  missing.close();
});
