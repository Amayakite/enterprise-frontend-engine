import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/") && specifier.endsWith(".vue"))
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier.startsWith("@/"))
      return next(pathToFileURL(resolve("src", `${specifier.slice(2)}.ts`)).href, context);
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier))
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".vue"))
      return { format: "module", source: "export default {};", shortCircuit: true };
    return next(url, context);
  },
});

const { createReferenceField } = await import("../src/components/business/fields/reference.ts");
const { applyReferenceOverrides } =
  await import("../src/components/business/fields/reference-overrides.ts");
const { compileLinks } = await import("../src/components/business/fields/links.ts");

function setupReferences() {
  const calls = [];
  const source = {
    key: "override-test",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    resolve: async () => ({ items: [], unavailableIds: [] }),
  };
  const customer = createReferenceField()({
    source,
    filters: () => ({}),
    scopeKey: () => "org-a",
    map: (event) => {
      calls.push(`default:${event.reason}`);
      return { customerName: event.items[0]?.name ?? "" };
    },
  });
  return { calls, customer };
}

function sendCommit(reference, value, items, model, calls) {
  const links = compileLinks([
    { watch: ["customerId"], writes: ["dependent"], clear: ["dependent"] },
  ]);
  const env = { model, context: {}, mode: "edit" };
  const vnode = reference.render(model.customerId, env, false, (nextValue, mapped, reason) => {
    calls.push(`commit:${reason}`);
    model = links(
      env,
      { customerId: null, customerName: "", dependent: "", memo: "" },
      { ...mapped, customerId: nextValue },
      reason
    ).model;
    calls.push(`links:${model.dependent}`);
  });
  vnode.props.onCommit({ value, items, reason: value === null ? "clear" : "select" });
  return model;
}

test("M01/M02 withMap 在页面实例替换回写，不改默认定义或另一标签覆盖", () => {
  const { calls, customer } = setupReferences();
  const editA = customer.withMap((event) => {
    calls.push(`edit-a:${event.reason}`);
    return { customerName: `A:${event.items[0]?.name ?? ""}` };
  });
  const editB = customer.withMap((event) => {
    calls.push(`edit-b:${event.reason}`);
    return { customerName: `B:${event.items[0]?.name ?? ""}` };
  });
  const originalCustomerField = {
    key: "customerId",
    label: "客户",
    type: "reference",
    form: {},
    reference: customer,
  };
  const memoField = { key: "memo", label: "备注", type: "text", form: {} };
  const fields = [originalCustomerField, memoField];

  assert.strictEqual(applyReferenceOverrides(fields), fields, "没有覆盖时不复制共享字段数组");
  const aFields = applyReferenceOverrides(fields, { customerId: editA });
  const bFields = applyReferenceOverrides(fields, { customerId: editB });
  assert.notStrictEqual(aFields, fields);
  assert.notStrictEqual(aFields[0], originalCustomerField);
  assert.strictEqual(aFields[1], memoField, "未覆盖字段仍复用原定义");
  assert.strictEqual(fields[0].reference, customer, "共享模块字段不被实例写入");
  assert.strictEqual(aFields[0].reference, editA);
  assert.strictEqual(bFields[0].reference, editB);

  let model = { customerId: "old", customerName: "旧名", dependent: "待清空", memo: "" };
  model = sendCommit(aFields[0].reference, "A-1", [{ id: "A-1", name: "甲" }], model, calls);
  assert.deepEqual(model, { customerId: "A-1", customerName: "A:甲", dependent: "", memo: "" });
  model = sendCommit(bFields[0].reference, "B-1", [{ id: "B-1", name: "乙" }], model, calls);
  assert.equal(model.customerName, "B:乙");
  assert.deepEqual(calls, [
    "edit-a:select",
    "commit:user",
    "links:",
    "edit-b:select",
    "commit:user",
    "links:",
  ]);
});

test("M03/M04 覆盖回写在用户清空时仍执行，并继续把结果交给原 links", () => {
  const { calls, customer } = setupReferences();
  const local = customer.withMap((event) => {
    calls.push(`local:${event.reason}`);
    return { customerName: event.items[0]?.name ?? "已清空" };
  });
  const initial = { customerId: "C-1", customerName: "旧客户", dependent: "依赖值", memo: "" };
  const result = sendCommit(local, null, [], initial, calls);
  assert.deepEqual(result, { customerId: null, customerName: "已清空", dependent: "", memo: "" });
  assert.deepEqual(calls, ["local:clear", "commit:user", "links:"]);
});

test("M05 覆盖未知字段或非参照字段给出明确运行时诊断", () => {
  const { customer } = setupReferences();
  const fields = [
    { key: "customerId", label: "客户", type: "reference", form: {}, reference: customer },
    { key: "memo", label: "备注", type: "text", form: {} },
  ];
  assert.throws(
    () => applyReferenceOverrides(fields, { unknown: customer }),
    /不能覆盖非参照字段：unknown/
  );
  assert.throws(
    () => applyReferenceOverrides(fields, { memo: customer }),
    /不能覆盖非参照字段：memo/
  );
});
