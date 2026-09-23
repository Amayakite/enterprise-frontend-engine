import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSearchItems,
  createMenuSearch,
  highlightTitle,
} from "../src/pages/layout/components/CommandPalette/search.ts";

const routes = [
  {
    path: "/base",
    children: [
      {
        path: "customer",
        name: "CustomerManagement",
        meta: { title: "客户管理", searchAliases: ["客管"], params: { scope: "active" } },
      },
      { path: "customer/add", meta: { title: "新增客户", hidden: true } },
      { path: "customer/:id", meta: { title: "客户详情" } },
      { path: "https://example.com", meta: { title: "外链" } },
      {
        path: "secret",
        meta: { hidden: true },
        children: [{ path: "child", meta: { title: "隐藏子菜单" } }],
      },
    ],
  },
];

test("搜索只索引当前菜单，排除隐藏父子路由、动态实体与外链", () => {
  const items = collectSearchItems(routes);
  assert.equal(items.length, 1);
  assert.equal(items[0].path, "/base/customer");
  assert.deepEqual(items[0].query, { scope: "active" });
  assert.deepEqual(collectSearchItems([]), []);
});

test("标题、别名和英文拼写容错；无结果返回空数组", () => {
  const search = createMenuSearch(collectSearchItems(routes));
  for (const keyword of ["客户", "客管", "custmer", "  customer  "]) {
    assert.equal(search(keyword)[0]?.item.path, "/base/customer", keyword);
  }
  assert.deepEqual(search("不匹配的zzzzzz内容"), []);
});

test("匹配高亮保持原始文本、支持重叠区间，不构造 HTML", () => {
  const parts = highlightTitle("<客户>管理", [
    [1, 2],
    [2, 3],
  ]);
  assert.equal(parts.map((part) => part.text).join(""), "<客户>管理");
  assert.deepEqual(parts, [
    { text: "<", matched: false },
    { text: "客户>", matched: true },
    { text: "管理", matched: false },
  ]);
});
