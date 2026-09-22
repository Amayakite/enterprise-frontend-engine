import { isEmptyValue } from "../src/utils/validate.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer, h, reactive } from "vue";
import { flush } from "./reference-harness.mjs";
const { compileLinks } = await import("../src/components/business/fields/links.ts");
const { cloneModel, sameModelValue } = await import("../src/components/business/fields/model.ts");
const { normalizeFields, defineFields, buildSearchFields } =
  await import("../src/components/business/fields/normalize.ts");
const { createReferenceValidationBatch } =
  await import("../src/components/business/fields/validation.ts");
const { useFormModel } = await import("../src/components/business/MyForm/useFormModel.ts");
const { createInitialModel, toSavePayload, toQueryPayload } =
  await import("../src/pages/component-lab/form/adapters.ts");
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
const initial = () => ({
  customerId: null,
  contactId: null,
  phone: "",
  note: "",
  custom: { tags: [] },
  amount: 0,
  enabled: false,
});
const dependency = {
  watch: ["customerId"],
  writes: ["contactId", "phone"],
  clear: ["contactId", "phone"],
};
function mount(modelValue = initial(), confirmed) {
  const events = [];
  const props = reactive({
    modelValue,
    context: {},
    createInitialModel: initial,
    links: [dependency],
  });
  let state;
  const app = renderer.createApp({
    setup() {
      state = useFormModel(
        props,
        (model, patch) => {
          events.push(patch);
          props.modelValue = model;
        },
        confirmed ? { enabled: () => true, emit: (event) => confirmed.push(event) } : undefined
      );
      return () => h("div");
    },
  });
  app.mount({});
  return { props, state, events, close: () => app.unmount() };
}

test("F01 显隐、模式、动态必填与顶层只读统一展开，未声明场景不出现", () => {
  const fields = defineFields()([
    {
      key: "amount",
      label: "金额",
      type: "number",
      form: {
        required: ({ model }) => model.enabled,
        visible: ({ context }) => context.visible,
        readonly: false,
      },
    },
    { key: "note", label: "备注", type: "text" },
  ]);
  const normalized = normalizeFields(
    fields,
    { model: { enabled: true }, context: { visible: false }, mode: "edit" },
    true
  );
  assert.equal(normalized[0].form.visible, false);
  assert.equal(normalized[0].form.required, true);
  assert.equal(normalized[0].form.readonly, true);
  assert.equal(normalized[1].form, undefined);
  assert.equal(normalized[1].table, undefined);
  assert.equal(normalized[1].detail, undefined);
  assert.throws(() => defineFields()([fields[0], fields[0]]), /重复字段/);
});

test("F02 hydrate/reset 使用独立嵌套快照且移除上一实体额外字段", async () => {
  const ctx = mount({ ...initial(), extra: "旧实体" });
  const entity = {
    ...initial(),
    customerId: 0,
    contactId: "c0",
    phone: "123",
    custom: { tags: ["保存"] },
  };
  ctx.state.hydrate(entity);
  entity.custom.tags.push("外部修改");
  ctx.state.applyPatch({ custom: { tags: ["修改"] }, note: "运行期" });
  ctx.state.reset();
  await flush();
  assert.deepEqual(ctx.props.modelValue.custom.tags, ["保存"]);
  assert.equal(ctx.props.modelValue.extra, undefined);
  assert.equal(ctx.props.modelValue.contactId, "c0");
  assert.deepEqual(
    ctx.events.map((event) => event.reason),
    ["hydrate", "external", "reset"]
  );
  ctx.close();
});

test("R09/R10 hydrate 不清联系人，真实客户变化原子清空，同步回写不重跑", async () => {
  const ctx = mount();
  ctx.state.hydrate({ ...initial(), customerId: 0, contactId: "c0", phone: "123" });
  assert.equal(ctx.props.modelValue.contactId, "c0");
  ctx.state.applyPatch({ customerId: 2 }, "user", "customerId");
  await flush();
  assert.equal(ctx.events.length, 2);
  assert.deepEqual(ctx.events[1].changes, { customerId: 2, contactId: null, phone: "" });
  ctx.props.modelValue = { ...ctx.props.modelValue };
  await flush();
  assert.equal(ctx.events.length, 2);
  ctx.state.applyPatch({ contactId: "c2", phone: "456" }, "user", "contactId");
  assert.equal(ctx.events.length, 3);
  assert.equal(ctx.props.modelValue.phone, "456");
  ctx.close();
});

test("外部原位更新触发依赖一次，0 与字符串 0 不被混同", async () => {
  const ctx = mount({ ...initial(), customerId: 0, contactId: "c0", phone: "123" });
  ctx.props.modelValue.customerId = 1;
  await flush();
  assert.equal(ctx.props.modelValue.contactId, null);
  assert.equal(ctx.events.length, 1);
  assert.equal(ctx.events[0].reason, "external");
  assert.equal(sameModelValue(0, "0"), false);
  ctx.close();
});

test("F03 环路显示字段链，冲突不依赖规则顺序，隐藏写入和异步 apply 拒绝", () => {
  assert.throws(
    () =>
      compileLinks([
        { watch: ["a"], writes: ["b"] },
        { watch: ["b"], writes: ["a"] },
      ]),
    /a → b → a/
  );
  const env = { model: { a: 0, b: 0 }, context: {}, mode: "add" };
  const rules = [
    { watch: ["a"], writes: ["b"], apply: () => ({ b: 1 }) },
    { watch: ["a"], writes: ["b"], apply: () => ({ b: 2 }) },
  ];
  for (const links of [rules, [...rules].reverse()])
    assert.throws(() => compileLinks(links)(env, env.model, { a: 1 }, "user"), /多写冲突：b/);
  assert.throws(
    () =>
      compileLinks([{ watch: ["a"], writes: [], apply: () => ({ b: 1 }) }])(
        env,
        env.model,
        { a: 1 },
        "user"
      ),
    /未声明写字段/
  );
  assert.throws(
    () =>
      compileLinks([{ watch: ["a"], writes: ["b"], apply: async () => ({ b: 1 }) }])(
        env,
        env.model,
        { a: 1 },
        "user"
      ),
    /必须同步/
  );
});

test("联动按依赖求值一次，配置逆序也得到一致结果", () => {
  const links = [
    { watch: ["b"], writes: ["c"], apply: ({ model }) => ({ c: model.b + 1 }) },
    { watch: ["a"], writes: ["b"], apply: ({ model }) => ({ b: model.a + 1 }) },
  ];
  const model = { a: 0, b: 0, c: 0 };
  assert.deepEqual(
    compileLinks(links)({ model, context: {}, mode: "add" }, model, { a: 1 }, "user").model,
    { a: 1, b: 2, c: 3 }
  );
  assert.deepEqual(model, { a: 0, b: 0, c: 0 });
});

test("F04 查询保留 0/false，空范围不生成 undefined 参数，DTO 只取白名单", () => {
  assert.deepEqual(toQueryPayload({ keyword: "  ", minimum: 0, enabled: false, period: null }), {
    minimum: 0,
    enabled: false,
  });
  assert.deepEqual(
    toQueryPayload({
      keyword: " a ",
      minimum: null,
      enabled: false,
      period: ["2026-09-01", "2026-09-30"],
    }),
    { keyword: "a", enabled: false, startDate: "2026-09-01", endDate: "2026-09-30" }
  );
  assert.equal(isEmptyValue(false), false);
  assert.equal(isEmptyValue(0), false);
  assert.equal(isEmptyValue([]), true);
  const payload = toSavePayload({
    ...createInitialModel(),
    injected: "不提交",
    customerName: "展示名",
  });
  assert.equal(payload.injected, undefined);
  assert.equal(payload.customerName, undefined);
  assert.throws(
    () => buildSearchFields()([{ key: "a", type: "text", search: { operator: "sql" } }]),
    /操作符/
  );
});

test("同 source/条件的参照有效性批量检查保留 ID 类型，跨条件隔离", async () => {
  const batch = createReferenceValidationBatch();
  const owner = {};
  const requests = [];
  const resolve = async (ids) => {
    requests.push(ids);
    return ids;
  };
  const results = await Promise.all([
    batch.run(owner, "a", [0, "0"], resolve),
    batch.run(owner, "a", [2, 0], resolve),
    batch.run(owner, "b", [3], resolve),
  ]);
  assert.deepEqual(requests, [[0, "0", 2], [3]]);
  assert.deepEqual(results[0], results[1]);
});

test("快照与初始工厂不会共享数组、附件或 Date 引用", () => {
  const first = createInitialModel();
  first.images.push("/a.png");
  assert.deepEqual(createInitialModel().images, []);
  const original = { files: [{ name: "a", url: "/a" }], date: new Date("2026-09-09") };
  const snapshot = cloneModel(original);
  snapshot.files[0].name = "b";
  snapshot.date.setFullYear(2025);
  assert.equal(original.files[0].name, "a");
  assert.equal(original.date.getFullYear(), 2026);
});

test("formKey 与新实体同批更新时只 hydrate，不先触发外部清空", async () => {
  const ctx = mount({ ...initial(), customerId: 0, contactId: "c0" });
  ctx.props.modelValue = { ...initial(), customerId: 2, contactId: "c2", phone: "新电话" };
  ctx.props.formKey = "entity-2";
  await flush();
  assert.equal(ctx.props.modelValue.contactId, "c2");
  assert.equal(ctx.props.modelValue.phone, "新电话");
  assert.deepEqual(
    ctx.events.map((event) => event.reason),
    ["hydrate"]
  );
  ctx.close();
});

test("事务中依赖值恢复原值不误触发更下游规则", () => {
  const model = { a: 0, b: 0, c: 0 };
  const links = [
    { watch: ["a"], writes: ["b"], clear: ["b"] },
    { watch: ["b"], writes: ["c"], apply: () => ({ c: 99 }) },
  ];
  assert.deepEqual(
    compileLinks(links)({ model, context: {}, mode: "add" }, model, { a: 1, b: 2 }, "user"),
    { model: { a: 1, b: 0, c: 0 }, changes: { a: 1 } }
  );
});

test("批量请求开始后的新 ID 创建新批次，不复用缺少该 ID 的结果", async () => {
  const batch = createReferenceValidationBatch();
  const owner = {};
  assert.deepEqual(await batch.run(owner, "a", [0], async (ids) => ids), [0]);
  assert.deepEqual(await batch.run(owner, "a", [2], async (ids) => ids), [2]);
});

test("字段确认合并逐字输入，等值、hydrate/reset 和程序 patch 不冒充用户 change", async () => {
  const confirmed = [];
  const ctx = mount(initial(), confirmed);
  ctx.state.applyPatch({ note: "a" }, "user", "note");
  ctx.state.applyPatch({ note: "ab" }, "user", "note");
  assert.equal(confirmed.length, 0);
  ctx.state.commit("note");
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].previous.note, "");
  assert.equal(confirmed[0].model.note, "ab");
  assert.deepEqual(confirmed[0].changes, { note: "ab" });
  ctx.state.commit("note");
  assert.equal(confirmed.length, 1);
  ctx.state.applyPatch({ note: "x" }, "user", "note");
  ctx.state.applyPatch({ note: "ab" }, "user", "note");
  ctx.state.commit("note");
  assert.equal(confirmed.length, 1);
  ctx.state.applyPatch({ note: "程序值" });
  ctx.state.commit("note");
  ctx.state.hydrate(initial());
  ctx.state.commit("note");
  ctx.state.reset();
  ctx.state.commit("note");
  assert.equal(confirmed.length, 1);
  ctx.close();
});

test("参照确认在 ID、映射及同步依赖清空后仅通知一次，主字段保留原 ID 类型", () => {
  const confirmed = [];
  const ctx = mount(
    { ...initial(), customerId: "旧客户", contactId: "旧联系人", phone: "123" },
    confirmed
  );
  ctx.state.applyPatch({ customerId: 0, note: "客户名称回填" }, "user", "customerId");
  ctx.state.commit("customerId");
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].field, "customerId");
  assert.equal(confirmed[0].model.customerId, 0);
  assert.equal(confirmed[0].model.note, "客户名称回填");
  assert.equal(confirmed[0].model.contactId, null);
  assert.equal(confirmed[0].model.phone, "");
  assert.deepEqual(Object.keys(confirmed[0].changes).sort(), [
    "contactId",
    "customerId",
    "note",
    "phone",
  ]);
  ctx.state.applyPatch({ customerId: null }, "dependency", "customerId");
  ctx.state.commit("customerId");
  assert.equal(confirmed[1].reason, "dependency");
  ctx.close();
});

test("字段增量更新保持未变子表引用，发布模型和重置基线仍与内部模型隔离", async () => {
  const ctx = mount({ ...initial(), custom: { tags: ["初始"] } });
  try {
    const internal = ctx.state.model.value.custom;
    ctx.state.applyPatch({ note: "第一次" }, "user", "note");
    await flush();
    const published = ctx.props.modelValue.custom;
    assert.equal(ctx.state.model.value.custom, internal);
    assert.notEqual(published, internal);
    ctx.state.applyPatch({ note: "第二次" }, "user", "note");
    await flush();
    assert.equal(ctx.state.model.value.custom, internal);
    assert.equal(ctx.props.modelValue.custom, published);
    // 受控宿主的原位修改不能同步污染内部模型，但仍按既有深监听合同回写。
    published.tags.push("外部");
    assert.deepEqual(internal.tags, ["初始"]);
    await flush();
    assert.deepEqual(ctx.state.model.value.custom.tags, ["初始", "外部"]);
    ctx.state.reset();
    await flush();
    assert.deepEqual(ctx.state.model.value.custom.tags, ["初始"]);
  } finally {
    ctx.close();
  }
});

test("普通输入不调用联动默认值工厂，clear 才读取一次且回调不能污染未变分支", () => {
  let reads = 0;
  const model = { source: 0, dependent: "old", children: [{ name: "safe" }] };
  const initial = () => {
    reads++;
    return { ...model, dependent: "" };
  };
  const plain = compileLinks([])(
    { model, context: {}, mode: "add" },
    initial,
    { source: 1 },
    "user"
  );
  assert.equal(reads, 0);
  assert.equal(plain.model.children, model.children);
  const linked = compileLinks([
    {
      watch: ["source"],
      writes: ["dependent"],
      clear: ["dependent"],
      apply: ({ model }) => {
        model.children[0].name = "changed";
        return {};
      },
    },
  ])({ model, context: {}, mode: "add" }, initial, { source: 2 }, "user");
  assert.equal(reads, 1);
  assert.equal(linked.model.dependent, "");
  assert.equal(model.children[0].name, "safe");
});
