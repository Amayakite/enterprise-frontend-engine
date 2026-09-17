import test from "node:test";
import assert from "node:assert/strict";
import "./reference-harness.mjs";

const { createNavigationMailbox, parseNavigationIntent, stripNavigationQuery } =
  await import("../src/router/navigation-intent.ts");

test("临时导航参数只在已登记目标的准确页面生效，业务 query 保持原值", () => {
  const query = {
    page: "2",
    draft: "customer:new",
    __navTarget: "customer",
    __navAction: "create",
    __navToken: "nav-1",
  };
  assert.deepEqual(stripNavigationQuery(query), { page: "2", draft: "customer:new" });
  assert.deepEqual(parseNavigationIntent("/base/customer", query), {
    target: "customer",
    action: "create",
    token: "nav-1",
  });
  assert.equal(parseNavigationIntent("/base/customer/add", query), undefined);
  assert.equal(
    parseNavigationIntent("/base/customer", {
      ...query,
      __navTarget: ["customer"],
    }),
    undefined
  );
  assert.equal(
    parseNavigationIntent("/base/customer", {
      ...query,
      __navToken: "<not-a-token>",
    }),
    undefined
  );
});

test("邮箱仅在对应导航成功后交付一次，取消和过期记录不可复活", () => {
  let clock = 1000;
  const mailbox = createNavigationMailbox(() => clock);
  mailbox.source("one", { fullPath: "/source?draft=1", title: "来源" });
  mailbox.stage({
    token: "one",
    target: "customer",
    action: "create",
    destination: "/base/customer",
  });
  assert.equal(mailbox.take("/base/customer"), undefined, "不能在 router 成功前提前消费");
  mailbox.finish("/base/customer", true);
  assert.deepEqual(mailbox.take("/base/customer"), {
    token: "one",
    target: "customer",
    action: "create",
    destination: "/base/customer",
    source: { fullPath: "/source?draft=1", title: "来源" },
  });
  assert.equal(mailbox.take("/base/customer"), undefined, "相同 token 不重复播放引导");
  mailbox.cancel("one");
  mailbox.stage({
    token: "cancelled",
    target: "customer",
    action: "create",
    destination: "/base/customer",
  });
  mailbox.cancel("cancelled");
  mailbox.finish("/base/customer", true);
  assert.equal(mailbox.take("/base/customer"), undefined);
  mailbox.stage({
    token: "expired",
    target: "customer",
    action: "create",
    destination: "/base/customer",
  });
  clock += 300_000;
  assert.equal(mailbox.size, 0, "五分钟后的未交付条目必须懒清理");
  mailbox.finish("/base/customer", true);
  assert.equal(mailbox.take("/base/customer"), undefined);
});

test("快速连续导航彼此隔离：完成 A 不能撤销仍在等待的 B", () => {
  const mailbox = createNavigationMailbox(() => 1);
  mailbox.stage({
    token: "a",
    target: "customer",
    action: "create",
    destination: "/base/customer?page=A",
  });
  mailbox.stage({
    token: "b",
    target: "customer",
    action: "view",
    destination: "/base/customer/detail/B",
  });
  mailbox.finish("/base/customer?page=A", true, "a");
  assert.equal(mailbox.take("/base/customer?page=A")?.token, "a");
  mailbox.finish("/base/customer/detail/B", true, "b");
  assert.equal(mailbox.take("/base/customer/detail/B")?.token, "b");
});

test("邮箱容量有界：淘汰最旧待处理记录但保留最近 16 条", () => {
  const mailbox = createNavigationMailbox(() => 1);
  for (let index = 0; index < 20; index += 1) {
    mailbox.stage({
      token: `token-${index}`,
      target: "customer",
      action: "create",
      destination: `/base/customer?attempt=${index}`,
    });
  }
  assert.equal(mailbox.size, 16);
  mailbox.finish("/base/customer?attempt=0", true, "token-0");
  assert.equal(mailbox.take("/base/customer?attempt=0"), undefined, "最旧记录已被淘汰");
  mailbox.finish("/base/customer?attempt=19", true, "token-19");
  assert.equal(mailbox.take("/base/customer?attempt=19")?.token, "token-19");
});
