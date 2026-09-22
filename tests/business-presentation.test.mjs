import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { effectScope } from "vue";
import "./reference-harness.mjs";
const { useBusinessPresentation } = await import("../src/composables/useBusinessPresentation.ts");

test("dialog/drawer 复用懒加载页面，取消关闭保留实例，确认后释放", async () => {
  const scope = effectScope();
  const host = scope.run(() => useBusinessPresentation("/base/customer", "客户"));
  let imports = 0,
    allowed = false,
    checks = 0;
  const loader = async () => {
    imports++;
    return { default: {} };
  };
  await host.open({ mode: "edit", id: "a/b" }, { mode: "drawer", component: loader });
  assert.equal(imports, 0, "没有实际渲染前不加载页面");
  const current = host.current;
  assert.equal(current.mode, "drawer");
  assert.equal(current.context.instanceKey, "/base/customer/edit/a%2Fb");
  current.context.register({
    canLeave: async () => {
      checks++;
      return allowed;
    },
    cancelLeaveApproval() {},
  });
  await Promise.all([host.close(), host.close()]);
  assert.equal(checks, 1, "重复关闭共享确认");
  assert.equal(host.current, current);
  allowed = true;
  await host.close();
  assert.equal(host.current, null);
  await host.open({ mode: "add" }, { mode: "dialog", component: loader });
  assert.equal(host.current.context.target.mode, "add");
  await host.current.context.saved("new-id");
  assert.equal(host.current, null);
  scope.stop();
});

test("非路由模式缺少 loader 明确报错，不悄悄退回其他打开方式", async () => {
  const scope = effectScope();
  const host = scope.run(() => useBusinessPresentation("/base/customer", "客户"));
  await assert.rejects(host.open({ mode: "add" }, { mode: "drawer" }), /component/);
  scope.stop();
});

test("嵌入页面上下文固定于实例，刷新完成后交由原实例保存端口关闭", () => {
  const source = readFileSync("src/components/business/crud/MyBusinessPageContent.vue", "utf8");
  assert.ok(source.indexOf("const editor = props.editor") >= 0);
  assert.ok(
    source.indexOf("await props.afterSave?.();") < source.indexOf("await editor.context.saved(id);")
  );
});
