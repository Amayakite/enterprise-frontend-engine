import test from "node:test";
import assert from "node:assert/strict";
import "./reference-harness.mjs";
const { resolveDetailSummary } = await import("../src/components/business/crud/detail-summary.ts");

test("摘要仅展示详情场景字段、重复键只展示一次并保留 false 和 0", () => {
  const fields = [
    { key: "name", type: "text", label: "名称", detail: true },
    { key: "active", type: "switch", label: "启用", detail: true },
    { key: "code", type: "text", label: "编码", detail: true },
    { key: "secret", type: "text", label: "隐藏", detail: false },
    { key: "remark", type: "textarea", label: "备注", detail: true },
  ];
  const env = {
    model: { name: "组织", active: false, code: 0, secret: "不可展示", remark: "" },
    mode: "edit",
  };
  const result = resolveDetailSummary(fields, env, {
    titleField: "name",
    statusFields: ["active", "name", "secret"],
    descriptionFields: ["code", "active", "secret"],
  });
  assert.equal(result.title.key, "name");
  assert.deepEqual(
    result.status.map((field) => field.key),
    ["active"]
  );
  assert.deepEqual(
    result.description.map((field) => field.key),
    ["code"]
  );
  assert.deepEqual(
    result.fields.map((field) => field.key),
    ["remark"]
  );
  assert.equal(env.model.active, false);
  assert.equal(env.model.code, 0);
});

test("摘要取走组首字段仍保留资料分组，且不修改原配置", () => {
  const fields = [
    { key: "name", type: "text", label: "名称", detail: { group: "基本资料" } },
    { key: "code", type: "text", label: "编码", detail: true },
    { key: "remark", type: "textarea", label: "备注", detail: { group: "备注" } },
  ];
  const env = { model: { name: "", code: "", remark: "" }, mode: "edit" };
  const result = resolveDetailSummary(fields, env, { titleField: "name" });
  assert.equal(result.fields[0].detail.group, "基本资料");
  assert.equal(result.fields[1].detail.group, "备注");
  assert.equal(fields[1].detail, true);
  const fallback = resolveDetailSummary(fields, env, { titleField: "missing" });
  assert.equal(fallback.title, undefined);
  assert.deepEqual(
    fallback.fields.map((field) => field.key),
    ["name", "code", "remark"]
  );
});
