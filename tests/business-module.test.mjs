import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import "./reference-harness.mjs";

const { compileModuleFields } = await import("../src/components/business/crud/module-fields.ts");
const { defineAggregateBinding } = await import("../src/components/business/crud/aggregate.ts");
const { defineBusinessModule } = await import("../src/components/business/crud/module.ts");
const schema = {
  name: { label: "名称", kind: "text", operators: ["eq"], entries: ["normal"] },
  keyword: { label: "关键字", kind: "text", operators: ["contains"], entries: ["quick"] },
};

test("单一字段按场景派生：继承、关闭、顺序、规则替换且不改变输入", () => {
  const format = (value) => `名称：${value}`;
  const fields = [
    {
      key: "name",
      label: "名称",
      type: "text",
      form: { required: true, rules: [{ min: 2 }] },
      detail: { format },
      scenes: {
        list: true,
        edit: { readonly: true, rules: [{ min: 3 }] },
        detail: true,
        query: { key: "name" },
      },
    },
    {
      key: "code",
      label: "编号",
      type: "text",
      form: {},
      scenes: { add: false, list: { order: -1, minWidth: 100 }, detail: false },
    },
    { key: "serverOnly", label: "审计", type: "text", scenes: { detail: true } },
  ];
  const result = compileModuleFields(fields, schema, ["keyword"]);
  assert.deepEqual(
    result.columns.map((f) => f.key),
    ["code", "name"]
  );
  assert.deepEqual(
    result.add.map((f) => f.key),
    ["name"]
  );
  assert.deepEqual(
    result.edit.map((f) => f.key),
    ["name", "code"]
  );
  assert.deepEqual(
    result.detail.map((f) => f.key),
    ["name", "serverOnly"]
  );
  assert.equal(result.detail[0].detail.format, format);
  assert.equal(result.edit[0].form.required, true);
  assert.equal(result.edit[0].form.readonly, true);
  assert.deepEqual(result.edit[0].form.rules, [{ min: 3 }]);
  assert.deepEqual(fields[0].form, { required: true, rules: [{ min: 2 }] });
  assert.notEqual(result.add[0], result.edit[0]);
  assert.deepEqual(result.query.keyword.entries, ["quick"]);
  const withoutQuery = compileModuleFields([], schema);
  assert.deepEqual(withoutQuery.query.name.entries, []);
  assert.deepEqual(schema.name.entries, ["normal"]);
  assert.throws(() => compileModuleFields([fields[0], fields[0]], schema), /重复字段/);
  assert.throws(
    () => compileModuleFields([{ ...fields[0], scenes: { query: { key: "missing" } } }], schema),
    /未声明/
  );
  assert.throws(() => compileModuleFields(fields, schema, ["name"]), /重复查询/);
});

test("静态字典自动派生查询呈现，不修改 API schema 或放宽白名单", () => {
  const api = {
    status: {
      label: "状态",
      kind: "enum",
      valueType: "string",
      options: [{ label: "待审", value: "pending" }],
      operators: ["eq"],
      entries: ["normal"],
    },
  };
  const fields = [
    {
      key: "status",
      label: "状态",
      type: "dict",
      dict: { code: "customer_status", valueType: "string" },
      emptyValue: "pending",
      scenes: { list: true, query: { key: "status" } },
    },
  ];
  const output = compileModuleFields(fields, api);
  assert.deepEqual(output.query.status.dictionary, {
    code: "customer_status",
    valueType: "string",
  });
  assert.equal(api.status.dictionary, undefined);
  assert.deepEqual(output.query.status.operators, ["eq"]);
  assert.deepEqual(output.query.status.options, api.status.options);
});

function child() {
  return defineAggregateBinding()({
    modelKey: "items",
    payloadKey: "details",
    config: {
      title: "明细",
      validateRows: (rows) => (rows.some((row) => !row.name) ? ["名称必填"] : []),
      persistence: {
        mode: "aggregate",
        toPayload: (rows) => rows.map((row) => ({ title: row.name.trim() })),
      },
    },
  });
}

test("主模型数组和整单 DTO 可异名，子行转换和空数组不丢失", () => {
  const binding = child();
  const model = { items: [{ name: " 示例 ", uiOnly: true }] };
  const dto = { [binding.payloadKey]: binding.toPayload(model) };
  assert.deepEqual(dto, { details: [{ title: "示例" }] });
  assert.equal(model.items[0].name, " 示例 ");
  assert.deepEqual(binding.toPayload({ items: [] }), []);
  assert.deepEqual(binding.validate({ items: [{ name: "" }] }), [
    { section: "items", message: "名称必填" },
  ]);
  assert.throws(() => binding.toPayload({ items: null }), /必须是数组/);
});

function moduleConfig(children = { lines: child() }) {
  return {
    meta: { key: "test.module", title: "测试模块" },
    api: {
      list: async () => ({ list: [], total: 0 }),
      detail: async () => ({}),
      create: async (x) => x,
      update: async (_, x) => x,
    },
    model: {
      create: () => ({ id: "", name: "", items: [] }),
      fromRecord: (x) => x,
      getKey: (x) => x.id,
      toCreate: (x) => x.model,
      toUpdate: (x) => x.model,
      resolveSaved: async (x) => x,
    },
    fields: [
      {
        key: "name",
        label: "名称",
        type: "text",
        form: { required: true },
        scenes: { list: true, detail: true, edit: { readonly: true } },
      },
    ],
    query: { schema, initial: { where: null } },
    children,
    views: {
      list: { getKey: (x) => x.id, scope: () => ({ key: "org", value: {} }), toQuery: (x) => x },
      form: {},
    },
  };
}

test("模块自动登记分区、子数组、详情页签和多行校验；页面初始状态独立", async () => {
  const module = defineBusinessModule()(moduleConfig());
  const add = module.createViewConfig({}, "add");
  const edit = module.createViewConfig({}, "edit");
  assert.deepEqual(add.form.childKeys, ["items"]);
  assert.deepEqual(add.form.sections, [{ key: "items", label: "明细" }]);
  assert.deepEqual(add.detail.tabs, add.form.sections);
  assert.equal(add.form.fields[0].form.readonly, undefined);
  assert.equal(edit.form.fields[0].form.readonly, true);
  const first = add.form.createInitial();
  const second = edit.form.createInitial();
  first.items.push({ name: "" });
  assert.equal(second.items.length, 0);
  const validation = await add.form.validate({ model: first });
  assert.equal(validation.valid, false);
  assert.equal(validation.issues[0].section, "items");
  assert.throws(
    () => defineBusinessModule()(moduleConfig({ a: child(), b: child() })),
    /modelKey 重复/
  );
  assert.throws(
    () =>
      defineBusinessModule()(moduleConfig({ a: child(), b: { ...child(), modelKey: "other" } })),
    /payloadKey 重复/
  );
});

test("模块及子表的 TypeScript 正反例生效", () => {
  const configPath = path.resolve("tests/type-cases/tsconfig.business-module.json");
  execFileSync(
    process.execPath,
    ["node_modules/vue-tsc/bin/vue-tsc.js", "--noEmit", "-p", configPath],
    { encoding: "utf8" }
  );
  // 编译器会把未生效的 @ts-expect-error 作为错误报告，确保负例不是无效断言。
  assert.ok(
    readFileSync("tests/type-cases/business-module.ts", "utf8").includes("@ts-expect-error")
  );
});
test("fields 模块统一转换列表与批量目标的查询，初始不加额外模型字段", () => {
  const config = moduleConfig();
  config.query = { source: "fields" };
  config.fields[0].scenes.query = { normal: true, keyword: true };
  const runtime = defineBusinessModule()(config).createViewConfig({});
  assert.deepEqual(runtime.list.query.schema.keyword.entries, ["quick"]);
  assert.deepEqual(runtime.list.query.initial, { quick: [], normal: [], advanced: null });
  const scope = { key: "org", value: { organizationId: "org-a" } };
  const request = runtime.list.toQuery({
    pageNum: 1,
    pageSize: 20,
    scope,
    sort: null,
    where: {
      kind: "group",
      operator: "and",
      id: "root",
      children: [
        { kind: "condition", id: "kw", field: "keyword", operator: "contains", value: "客户" },
      ],
    },
  });
  assert.equal(request.scope, scope);
  assert.equal(request.where.children[0].children[0].field, "name");
  assert.equal("keyword" in runtime.form.createInitial(), false);
});

test("模块静态配置定义时检查，动态动作按场景装配且同一实例只创建一次", () => {
  const config = moduleConfig();
  const calls = [];
  config.views.list.actions = (navigation) => {
    calls.push(["list", navigation]);
    return [];
  };
  config.views.detail = {
    actions: (navigation) => {
      calls.push(["detail", navigation]);
      return [];
    },
  };
  const module = defineBusinessModule()(config);
  const navigation = {};
  const runtime = module.createViewConfig(navigation);
  assert.equal(calls.length, 0);
  assert.equal(runtime.list, runtime.list);
  assert.deepEqual(calls, [["list", navigation]]);
  assert.equal(runtime.detail, runtime.detail);
  assert.deepEqual(calls, [
    ["list", navigation],
    ["detail", navigation],
  ]);
  const second = module.createViewConfig({});
  assert.notEqual(second.form, runtime.form);
  assert.notEqual(second.list, runtime.list);
  const invalid = moduleConfig();
  invalid.views.list.pageSize = 13;
  assert.throws(() => defineBusinessModule()(invalid), /默认页大小/);
  const duplicate = moduleConfig();
  duplicate.views.list.actions = () => [{ key: "same" }, { key: "same" }];
  const bad = defineBusinessModule()(duplicate).createViewConfig({});
  assert.throws(() => bad.list, /动作 key为空或重复/);
});
