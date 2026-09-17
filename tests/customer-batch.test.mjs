import test from "node:test";
import assert from "node:assert/strict";
import "./reference-harness.mjs";
const { runCustomerBatch } = await import("../mock/customer-batch.ts");
const { createCustomerSeeds } = await import("../mock/customer-data.ts");

test("批量 ID/编码均可选择，部分失败反馈且不删除已审核客户", () => {
  const rows = createCustomerSeeds();
  rows[0].status = "approved";
  rows[1].status = "pending";
  const output = runCustomerBatch(rows, {
    componentKey: "customer",
    action: "delete",
    requestId: "test",
    target: {
      mode: "selected",
      batchCode: [rows[0].customerCode, rows[1].customerCode, "missing"],
    },
  });
  assert.equal(output.result.matched, 3);
  assert.equal(output.result.succeeded, 1);
  assert.equal(output.result.failed, 2);
  assert.ok(output.rows.some((x) => x.id === rows[0].id));
  assert.ok(!output.rows.some((x) => x.id === rows[1].id));
  const disabled = runCustomerBatch(output.rows, {
    componentKey: "customer",
    action: "disable",
    requestId: "test2",
    target: { mode: "selected", batchID: [rows[0].id] },
  });
  assert.equal(disabled.result.succeeded, 1);
  assert.equal(disabled.rows.find((x) => x.id === rows[0].id).active, false);
});

test("query 模式操作全部匹配，不受 pageSize 限制，并保留固定组织范围", () => {
  const seed = createCustomerSeeds()[0];
  const rows = Array.from({ length: 125 }, (_, i) => ({ ...seed, id: String(i), active: true }));
  const query = {
    scope: { key: "a", value: { organizationId: "org-a" } },
    where: null,
    pageNum: 2,
    pageSize: 20,
  };
  const output = runCustomerBatch(rows, {
    componentKey: "customer",
    action: "disable",
    requestId: "all",
    target: { mode: "query", query },
  });
  assert.equal(output.result.succeeded, 125);
  assert.ok(output.rows.every((x) => !x.active));
  assert.throws(() =>
    runCustomerBatch(rows, {
      componentKey: "customer",
      action: "disable",
      requestId: "bad",
      target: { mode: "query", query: { ...query, scope: { organizationId: "other" } } },
    })
  );
  assert.throws(() =>
    runCustomerBatch(rows, {
      componentKey: "unknown",
      action: "delete",
      requestId: "bad",
      target: {},
    })
  );
});
