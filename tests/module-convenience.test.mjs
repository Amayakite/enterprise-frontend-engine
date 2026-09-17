import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import "./reference-harness.mjs";

const { defineBusinessModel } = await import("../src/components/business/crud/model.ts");
const { defineRowCommands } = await import("../src/components/business/crud/row-actions.ts");
const { defineBusinessModule } = await import("../src/components/business/crud/module.ts");

test("模型默认流程隔离初值、回显与保存副本，编辑转换只执行一次", () => {
  const shared = { id: "a", name: " A ", lines: [{ value: "original" }] };
  let conversions = 0;
  const model = defineBusinessModel()({
    create: () => shared,
    fromRecord: (entity) => entity,
    getKey: (entity) => entity.id,
    toPayload: (value) => {
      conversions++;
      value.lines[0].value = "converted";
      return { name: value.name.trim(), lines: value.lines };
    },
    updatePayload: (payload, input) => ({ ...payload, version: input.baseline.version }),
    resolveSaved: async (value) => value,
  });
  model.create().lines[0].value = "changed";
  model.fromRecord(shared).lines[0].value = "changed";
  const input = { model: shared, baseline: { version: 7 }, target: { mode: "edit", id: "a" } };
  assert.deepEqual(model.toUpdate(input), {
    name: "A",
    lines: [{ value: "converted" }],
    version: 7,
  });
  assert.equal(shared.lines[0].value, "original");
  assert.equal(conversions, 1);
});

test("模型 overrides 只覆盖指定步骤；其余默认流程仍保留", () => {
  let fallback = 0;
  const model = defineBusinessModel()({
    create: () => ({ name: "base" }),
    fromRecord: (x) => x,
    getKey: (x) => x.id,
    toPayload: (x) => {
      fallback++;
      return x;
    },
    updatePayload: (x) => x,
    resolveSaved: async (x) => x,
    overrides: { toCreate: () => ({ name: "custom" }) },
  });
  assert.deepEqual(model.toCreate({ model: { name: "input" } }), { name: "custom" });
  assert.equal(fallback, 0);
  assert.deepEqual(model.toUpdate({ model: { name: "input" } }), { name: "input" });
  assert.equal(fallback, 1);
});

test("model 工厂直接取得内联 children，不反向读取主 config", () => {
  const children = {};
  let received;
  const module = defineBusinessModule()({
    meta: { key: "test", title: "测试" },
    fields: [],
    query: { schema: {}, initial: {} },
    children,
    model: (value) => {
      received = value;
      return {
        create: () => ({}),
        fromRecord: (x) => x,
        getKey: (x) => x.id,
        toCreate: (x) => x.model,
        toUpdate: (x) => x.model,
        resolveSaved: async (x) => x,
      };
    },
    api: {
      list: async () => ({ list: [], total: 0 }),
      detail: async () => ({}),
      create: async (x) => x,
      update: async (_, x) => x,
    },
    views: {
      list: { getKey: (x) => x.id, scope: () => ({ key: "scope", value: {} }), toQuery: (x) => x },
      form: {},
    },
  });
  assert.equal(received, children);
  assert.equal(typeof module.model.create, "function");
  assert.deepEqual(module.createRuntime({}).form.childKeys, []);
});

test("行命令生成权限/确认/回执，透传 signal，失败不吞掉也不重试", async () => {
  const signal = new AbortController().signal;
  const context = { row: { name: "A" }, rowKey: 0, signal };
  let calls = 0;
  const [action] = defineRowCommands()({
    entityLabel: "客户",
    permissionPrefix: "base:customer",
    getLabel: (row) => row.name,
    items: [
      {
        key: "approve",
        label: "审核",
        request: async (input) => {
          calls++;
          assert.equal(input.signal, signal);
        },
      },
    ],
  });
  assert.equal(action.permission, "base:customer:approve");
  assert.deepEqual(action.confirm(context), { title: "审核客户", message: "确定审核「A」吗？" });
  assert.deepEqual(await action.execute(context), { affectedKeys: [0], message: "客户已审核" });
  assert.equal(calls, 1);
  const [failure] = defineRowCommands()({
    entityLabel: "客户",
    getLabel: (row) => row.name,
    items: [
      {
        key: "fail",
        label: "失败",
        request: async () => {
          calls++;
          throw new Error("rejected");
        },
      },
    ],
  });
  await assert.rejects(failure.execute(context), /rejected/);
  assert.equal(calls, 2);
});

test("行命令支持覆盖默认权限、关闭确认、自定义回执及空提示", async () => {
  let writes = 0;
  const factory = defineRowCommands();
  const base = {
    key: "custom",
    label: "自定义",
    request: async () => {
      writes++;
    },
  };
  const [action, silent] = factory({
    entityLabel: "客户",
    permissionPrefix: "base",
    getLabel: (row) => row.name,
    items: [
      {
        ...base,
        permission: "special:write",
        confirm: false,
        execute: async () => ({ affectedKeys: [9] }),
      },
      { ...base, key: "silent", successMessage: "" },
    ],
  });
  assert.equal(action.permission, "special:write");
  assert.equal(action.confirm, undefined);
  assert.deepEqual(await action.execute({ rowKey: 1 }), { affectedKeys: [9] });
  assert.equal(writes, 0);
  assert.equal((await silent.execute({ rowKey: 1 })).message, "");
  assert.throws(
    () => factory({ entityLabel: "客户", getLabel: () => "", items: [base, base] }),
    /重复/
  );
});

test("TypeScript 悬停可读取动作与模块字段的实际 JSDoc，而非只读文档文件", () => {
  const file = path.resolve("tests/hover-fixture.ts");
  const isFixture = (name) => path.resolve(name).toLowerCase() === file.toLowerCase();
  const source = `import type { ActionOptions } from "../src/components/business/crud/types";
    import type { BusinessModuleContract } from "../src/components/business/crud/module";
    import { defineRowCommands } from "../src/components/business/crud/row-actions";
    import type { CustomerContract } from "../src/pages/base/customer/types";
    import type { BusinessModelOptions } from "../src/components/business/crud/model";
    import { createReferenceField } from "../src/components/business/fields/reference";
    import type { ReferenceSource } from "../src/components/business/MyReference/types";
    declare const geography: ReferenceSource<{ id: string; name: string }, string, { org: string }>;
    createReferenceField<{ parentId: string }, { scopeKey: string }>()({ source: geography,
      filters: env => ({ org: "a" }), scopeKey: env => env.context.scopeKey });
    declare const action: ActionOptions<{}, string>;
    declare const contract: BusinessModuleContract;
    declare const model: BusinessModelOptions<CustomerContract>;
    action.permission; action.confirm; action.execute; action.refresh; contract.Model; contract.Id;
    model.toPayload; model.updatePayload; model.overrides;
    defineRowCommands<{ name: string }, string, undefined>()({ entityLabel: "客户", getLabel: row => row.name,
      items: [{ key: "approve", label: "审核", request: async () => {} }] });`;
  const options = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    baseUrl: process.cwd(),
    paths: { "@/*": ["src/*"] },
  };
  const service = ts.createLanguageService({
    getScriptFileNames: () => [file],
    getScriptVersion: () => "1",
    getCompilationSettings: () => options,
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    getScriptSnapshot: (name) =>
      isFixture(name)
        ? ts.ScriptSnapshot.fromString(source)
        : fs.existsSync(name)
          ? ts.ScriptSnapshot.fromString(fs.readFileSync(name, "utf8"))
          : undefined,
    fileExists: (name) => isFixture(name) || ts.sys.fileExists(name),
    readFile: (name) => (isFixture(name) ? source : ts.sys.readFile(name)),
    readDirectory: ts.sys.readDirectory,
  });
  try {
    for (const [expression, expected] of [
      ["action.permission", "数组要求全部满足"],
      ["action.confirm", "确认"],
      ["action.execute", "实际操作"],
      ["action.refresh", "刷新策略"],
      ["contract.Model", "页面"],
      ["contract.Id", "主键"],
      ["model.toPayload", "隔离副本"],
      ["model.updatePayload", "不需再调用"],
      ["model.overrides", "替换指定"],
    ]) {
      const info = service.getQuickInfoAtPosition(
        file,
        source.indexOf(expression) + expression.indexOf(".") + 1
      );
      assert.ok(info, expression);
      assert.ok(ts.displayPartsToString(info.documentation).includes(expected), expression);
    }
    const configuredRequest = service.getQuickInfoAtPosition(
      file,
      source.indexOf("request: async")
    );
    assert.ok(
      ts.displayPartsToString(configuredRequest?.documentation).includes("执行单行写入"),
      "配置调用处的 request 也应显示接口 JSDoc"
    );
    for (const [expression, expected] of [
      ["source: geography", "数据源合同"],
      ["filters: env", "固定业务范围"],
    ]) {
      const info = service.getQuickInfoAtPosition(file, source.indexOf(expression));
      assert.ok(ts.displayPartsToString(info?.documentation).includes(expected), expression);
      assert.ok(
        info.tags?.some((tag) => tag.name === "example"),
        `${expression} 应有示例标签`
      );
    }
  } finally {
    service.dispose();
  }
});
