import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(`src/components/business/crud/${file}`, "utf8");

test("CRUD 的状态与错误提示统一使用 MyFeedback，保留原动作入口", () => {
  const detailToolbar = source("MyCrudDetailToolbar.vue");
  assert.doesNotMatch(detailToolbar, /<el-alert/);
  assert.match(
    detailToolbar,
    /<MyFeedback v-if="navigationError" :message="navigationError" tone="error"/
  );

  const batch = source("MyBatchActions.vue");
  assert.doesNotMatch(batch, /<el-alert/);
  assert.match(
    batch,
    /<MyFeedback v-if="controller\.error" :message="controller\.error" tone="error"/
  );
  assert.match(batch, /已完成项无需重复处理/);

  const form = source("MyCrudFormFeedback.vue");
  assert.doesNotMatch(form, /role="(alert|status)"/);
  assert.match(form, /<MyFeedback\s+v-if="controller\.draft"/);
  assert.match(form, /恢复草稿/);
  assert.match(form, /丢弃旧草稿/);
  assert.match(form, /重试草稿操作/);
  assert.match(form, /v-if="controller\.childrenReady === false"/);

  const list = source("MyCrudList.vue");
  assert.doesNotMatch(list, /crud-list__intent/);
  assert.match(list, /<MyFeedback\s+v-if="pageIntent\.intent\.value"/);
  assert.match(list, /返回\{\{ pageIntent\.intent\.value\.source\.title \}\}/);
  assert.match(list, /intentMessage/);
});

test("标准 Customer、Sale、Fee 页面以 MyFeedback 呈现 Mock 与初始化提示", () => {
  const pages = [
    "src/pages/base/customer/add.vue",
    "src/pages/base/customer/edit.vue",
    "src/pages/base/customer/index.vue",
    "src/pages/base/customer/detail.vue",
    "src/pages/base/sale/add.vue",
    "src/pages/base/sale/edit.vue",
    "src/pages/base/sale/index.vue",
    "src/pages/base/sale/detail.vue",
    "src/pages/task/fee/FeeEditor.vue",
    "src/pages/task/fee/detail.vue",
  ];
  for (const page of pages) {
    const content = readFileSync(page, "utf8");
    assert.doesNotMatch(content, /<el-alert/, page);
    assert.match(content, /MyFeedback/, page);
  }
});
