import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { createRenderer, h, reactive } from "vue";
import { flush, pending } from "./reference-harness.mjs";
// Vite 使用包的 module 入口；Node 行为测试使用同一入口。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "async-validator") return next("async-validator/dist-web/index.js", context);
    return next(specifier, context);
  },
});
const { useRowDraft } = await import("../src/components/table/useRowDraft.ts");
const { buildTableColumnBands, toTableColumns } =
  await import("../src/components/table/columns.ts");
const { appendProducts, createLine, toOrderPayload, lineAmount } =
  await import("../src/pages/component-lab/table/adapters.ts");
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
function mount(overrides = {}) {
  const props = reactive({
    rows: [
      { key: 0, quantity: 1, price: 2, amount: 2 },
      { key: "0", quantity: 3, price: 2, amount: 6 },
    ],
    getRowKey: (row) => row.key,
    context: { organization: "a" },
    fields: [
      {
        key: "quantity",
        label: "数量",
        type: "number",
        form: { required: true, rules: { type: "number", min: 1, message: "数量至少 1" } },
        table: {},
      },
    ],
    edit: {
      createInitialRow: () => ({ key: "", quantity: 1, price: 0, amount: 0 }),
      links: [
        {
          watch: ["quantity", "price"],
          writes: ["amount"],
          apply: ({ model }) => ({ amount: model.quantity * model.price }),
        },
      ],
    },
    ...overrides,
  });
  let state;
  const events = [];
  const app = renderer.createApp({
    setup() {
      state = useRowDraft(props, (key, changes) => {
        events.push({ key, changes });
        props.rows = props.rows.map((row) => (row.key === key ? { ...row, ...changes } : row));
      });
      return () => h("div");
    },
  });
  app.mount({});
  return { props, state, events, close: () => app.unmount() };
}
test("T03 数值 0 与字符串 0 独立，草稿取消隔离，联动提交一个原子 patch", async () => {
  const t = mount();
  assert.equal(t.state.begin(0), true);
  t.state.patch({ quantity: 4 });
  assert.equal(t.props.rows[0].quantity, 1);
  assert.equal(t.state.session.value.draft.amount, 8);
  t.state.cancelEdit();
  assert.equal(t.props.rows[0].quantity, 1);
  t.state.begin("0");
  t.state.patch({ quantity: 5 });
  assert.equal(await t.state.commitEdit(), true);
  assert.deepEqual(t.events, [{ key: "0", changes: { quantity: 5, amount: 10 } }]);
  assert.equal(t.props.rows[0].quantity, 1);
  t.close();
});

test("活动草稿按白名单快照恢复，不校验、不提交、不触发联动且可取消", () => {
  const t = mount();
  let changes = 0;
  const stop = t.state.subscribeDraft(() => changes++);
  t.state.begin(0);
  t.state.patch({ quantity: 0 });
  const snapshot = t.state.snapshotDraft(["quantity"]);
  assert.deepEqual(snapshot, { rowKey: 0, values: { quantity: 0 } });
  assert.equal(t.events.length, 0);
  t.state.cancelEdit();
  assert.equal(t.state.restoreDraft(snapshot, ["quantity"]), true);
  assert.equal(t.state.session.value.draft.quantity, 0);
  assert.equal(t.state.session.value.draft.amount, 2);
  assert.equal(t.state.errors.value.length, 0);
  assert.equal(t.props.rows[0].quantity, 1);
  assert.ok(changes > 0);
  stop();
  const previous = changes;
  t.state.cancelEdit();
  assert.equal(changes, previous);
  assert.equal(t.events.length, 0);
  t.close();
});

test("恢复活动草稿保留 ID 类型，拒绝稳定键变更并遵守当前只读字段", () => {
  const t = mount();
  t.props.fields[0].form.readonly = true;
  assert.equal(t.state.restoreDraft({ rowKey: "0", values: { quantity: 9 } }, ["quantity"]), true);
  assert.equal(t.state.session.value.draft.quantity, 3);
  assert.equal(t.state.restoreDraft({ rowKey: 0, values: { key: "0" } }, ["key"]), false);
  assert.equal(t.state.session.value, undefined);
  t.close();
});
test("T04 无效活动行阻止提交，修正后可重试且提交锁去重", async () => {
  const t = mount();
  t.state.begin(0);
  t.state.patch({ quantity: 0 });
  assert.equal(await t.state.commitEdit(), false);
  assert.equal(t.events.length, 0);
  assert.equal(t.state.errors.value[0].field, "quantity");
  assert.equal(t.state.pending.value, false);
  t.state.patch({ quantity: 2 });
  const a = t.state.commitEdit(),
    b = t.state.commitEdit();
  assert.equal(a, b);
  assert.equal(await a, true);
  assert.equal(t.events.length, 1);
  t.close();
});
test("T02 删除、外部替换或上下文变化使迟到校验失效，不写回下一行", async () => {
  for (const mutation of [
    (t) => {
      t.props.rows = [t.props.rows[1]];
    },
    (t) => {
      t.props.rows[0].price = 9;
    },
    (t) => {
      t.props.context.organization = "b";
    },
  ]) {
    const wait = pending();
    const t = mount({
      fields: [
        {
          key: "quantity",
          label: "数量",
          type: "number",
          form: { rules: { asyncValidator: () => wait.promise } },
        },
      ],
    });
    t.state.begin(0);
    t.state.patch({ quantity: 2 });
    const commit = t.state.commitEdit();
    mutation(t);
    wait.resolve();
    assert.equal(await commit, false);
    assert.equal(t.events.length, 0);
    assert.equal(t.state.session.value, undefined);
    t.close();
  }
});
test("T04 全量校验包含不在 props.rows 的行，稳定返回 rowKey/field", async () => {
  const t = mount();
  const all = [...t.props.rows, { key: "off-page", quantity: 0 }];
  const result = await t.state.validate(all);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].rowKey, "off-page");
  assert.equal(result.errors[0].field, "quantity");
  t.close();
});
test("U2 全量错误按行保留，修正活动行不会清掉其他页错误", async () => {
  const t = mount({
    rows: [
      { key: 0, quantity: 0, price: 2, amount: 0 },
      { key: "0", quantity: 0, price: 2, amount: 0 },
    ],
  });
  assert.equal((await t.state.validate()).errors.length, 2);
  assert.equal(t.state.begin(0), true);
  t.state.patch({ quantity: 2 });
  assert.deepEqual(
    t.state.errors.value.map((error) => error.rowKey),
    ["0"]
  );
  assert.equal(await t.state.commitEdit(), true);
  assert.deepEqual(
    t.state.errors.value.map((error) => error.rowKey),
    ["0"]
  );
  t.close();
});
test("R11 全量参照校验合并 source，失效明细禁止保存", async () => {
  const calls = [];
  const owner = {};
  const t = mount({
    fields: [
      {
        key: "key",
        label: "参照",
        type: "reference",
        form: {},
        reference: {
          validate: async (value, env, batch) => {
            const ids = await batch.run(owner, env.context.organization, [value], async (ids) => {
              calls.push(ids);
              return ids;
            });
            return { allowed: value !== "missing" && ids.includes(value), reason: "已失效" };
          },
        },
      },
    ],
  });
  const result = await t.state.validate([...t.props.rows, { key: "missing" }]);
  assert.equal(result.valid, false);
  assert.deepEqual(calls, [[0, "0", "missing"]]);
  t.close();
});
test("字段转列仅包含 table 白名单，不泄漏 form、reference 或查询配置", () => {
  const columns = toTableColumns([
    {
      key: "quantity",
      label: "数量",
      type: "number",
      table: { width: 100, sortable: true },
      form: { required: true },
    },
    { key: "secret", type: "text", label: "隐藏", form: {} },
  ]);
  assert.equal(columns.length, 1);
  assert.equal(columns[0].align, "right");
  assert.equal(columns[0].form, undefined);
  assert.equal(columns[0].sortable, true);
});

test("两层表头支持分组对齐与默认固定，并只合并相邻同配置列", () => {
  const profile = { key: "profile", label: "客户资料", align: "right", fixed: "left" };
  const bands = buildTableColumnBands([
    { key: "name", label: "名称", headerGroup: profile },
    { key: "type", label: "类型", headerGroup: profile },
    { key: "region", label: "地区" },
    { key: "contact", label: "联系人", headerGroup: { key: "contact", label: "联系" } },
    {
      key: "phone",
      label: "电话",
      fixed: "right",
      headerGroup: { key: "contact", label: "联系" },
    },
  ]);

  assert.deepEqual(
    bands.map(({ group, fixed, columns }) => ({
      group: group?.key,
      fixed,
      columns: columns.map(({ key }) => key),
    })),
    [
      { group: "profile", fixed: "left", columns: ["name", "type"] },
      { group: undefined, fixed: undefined, columns: ["region"] },
      { group: "contact", fixed: undefined, columns: ["contact"] },
      { group: "contact", fixed: "right", columns: ["phone"] },
    ]
  );
  assert.throws(
    () =>
      buildTableColumnBands([
        { key: "name", label: "名称", headerGroup: profile },
        { key: "type", label: "类型", headerGroup: { key: "profile", label: "基本资料" } },
      ]),
    /使用了不同配置/
  );

  const view = fs.readFileSync("src/components/table/TableView.vue", "utf8");
  assert.match(view, /<VxeColgroup\s+v-else-if="band\.group"/);
  assert.match(view, /:header-align="band\.group\.align \?\? 'center'"/);
  assert.match(view, /from "vxe-table\/es\/colgroup"/);
  assert.match(view, /v-for="band in renderedBands"/);
  assert.match(
    view,
    /renderedBands[\s\S]*system-leading[\s\S]*preparedColumns\.value\.bands[\s\S]*system-trailing/
  );
});
test("追加去重、未保存行键唯一、金额精度及 DTO 白名单", () => {
  const products = [
    { id: "0", price: 0.1 },
    { id: "p2", price: 0.2 },
    { id: "0", price: 99 },
  ];
  const rows = appendProducts([], products);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((r) => r.clientKey)).size, 2);
  assert.equal(appendProducts(rows, products).length, 2);
  assert.equal(lineAmount(3, 0.1), 0.3);
  assert.notEqual(createLine().clientKey, createLine().clientKey);
  const payload = toOrderPayload(
    { id: null, header: { title: " 单据 ", customerId: 0 }, lines: rows },
    { organizationId: "org-a" }
  );
  assert.equal(payload.title, "单据");
  assert.equal(payload.customerId, 0);
  assert.equal(payload.lines[0].clientKey, undefined);
  assert.equal(payload.lines[0].amount, undefined);
});
