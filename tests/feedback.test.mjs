import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createRenderer, h, nextTick, ref, KeepAlive } from "vue";
import { flush, pending } from "./reference-harness.mjs";

// useCrudActions 的确认框由自动导入提供；本测试不会进入离开确认，但需保持同名端口可用。
globalThis.ElMessageBox = { confirm: async () => "confirm" };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/utils/auth")
      return { url: "data:text/javascript,export const hasPerm = () => true;", shortCircuit: true };
    return next(specifier, context);
  },
});

const { summarizeFeedback } = await import("../src/utils/feedback-policy.ts");
const { feedbackNotices, notifyFeedback, pauseFeedback, resumeFeedback, clearFeedback } =
  await import("../src/utils/feedback.ts");
const { useCrudForm } = await import("../src/composables/useCrudForm.ts");

const renderer = createRenderer({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  patchProp() {},
  parentNode: () => null,
  nextSibling: () => null,
});

function resetFeedback() {
  clearFeedback();
}

function withFakeClock(run) {
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  Date.now = () => now;
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++sequence;
    timers.set(id, { at: now + Number(delay), callback });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
  const advance = (milliseconds) => {
    now += milliseconds;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort(([, left], [, right]) => left.at - right.at)[0];
      if (!due) return;
      const [id, timer] = due;
      timers.delete(id);
      timer.callback();
    }
  };
  try {
    return run({ advance });
  } finally {
    clearFeedback();
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

function mount(config, navigation) {
  let controller;
  const app = renderer.createApp({
    setup() {
      controller = useCrudForm(config, {
        context: () => ({ organizationId: "org-a" }),
        navigation,
      });
      return () => h("div");
    },
  });
  app.mount({});
  return { controller, close: () => app.unmount() };
}

function mountKept(config, navigation) {
  let controller;
  const visible = ref(true);
  const Editor = {
    setup() {
      controller = useCrudForm(config, {
        context: () => ({ organizationId: "org-a" }),
        navigation,
      });
      return () => h("div");
    },
  };
  const app = renderer.createApp({
    setup: () => () => h(KeepAlive, null, { default: () => (visible.value ? h(Editor) : null) }),
  });
  app.mount({});
  return {
    controller,
    async deactivate() {
      visible.value = false;
      await nextTick();
    },
    async activate() {
      visible.value = true;
      await nextTick();
    },
    close: () => app.unmount(),
  };
}

function formConfig(overrides = {}) {
  return {
    fields: [],
    createInitial: () => ({ name: "" }),
    load: async (id) => ({ id, name: "已加载" }),
    toModel: (entity) => ({ name: entity.name }),
    toCreate: ({ model }) => ({ ...model }),
    toUpdate: ({ model }) => ({ ...model }),
    create: async (dto) => ({ id: "created", name: dto.name }),
    update: async (id, dto) => ({ id, name: dto.name }),
    resolveSaved: async (result) => result,
    getKey: (entity) => entity.id,
    ...overrides,
  };
}

test("反馈摘要在长度和行数边界保持完整，超过边界才提供详情", () => {
  const exact = summarizeFeedback("a".repeat(100));
  assert.equal(exact.detailed, false);
  assert.equal(exact.summary, exact.text);

  const long = summarizeFeedback("a".repeat(101));
  assert.equal(long.detailed, true);
  assert.equal(long.summary, `${"a".repeat(100)}…`);

  const lines = summarizeFeedback("第一行\n第二行\n第三行\n第四行");
  assert.equal(lines.detailed, true);
  assert.equal(lines.summary, "第一行…");
});

test("同一 operation 替换旧通知，旧 close 句柄不会关闭新通知", () => {
  resetFeedback();
  const first = {};
  const second = {};
  const oldHandle = notifyFeedback("success", "保存成功", first);
  const newHandle = notifyFeedback("success", "保存成功", first);
  notifyFeedback("success", "保存成功", second);
  const [current, other] = feedbackNotices.value;
  assert.equal(feedbackNotices.value.length, 2);
  oldHandle.close();
  assert.equal(feedbackNotices.value.length, 2);
  assert.equal(feedbackNotices.value[0]?.id, current?.id);
  newHandle.close();
  assert.deepEqual(
    feedbackNotices.value.map((notice) => notice.id),
    [other?.id]
  );
  resetFeedback();
});

test("自动关闭与 hover/focus 暂停按剩余时间恢复", () => {
  resetFeedback();
  withFakeClock(({ advance }) => {
    const automatic = notifyFeedback("success", "保存成功");
    assert.equal(feedbackNotices.value.length, 1);
    advance(2599);
    assert.equal(feedbackNotices.value.length, 1);
    advance(1);
    assert.equal(feedbackNotices.value.length, 0);
    automatic.close();

    const paused = notifyFeedback("info", "正在处理");
    const id = feedbackNotices.value[0]?.id;
    assert.ok(id);
    advance(1000);
    pauseFeedback(id, "hover");
    advance(10000);
    assert.equal(feedbackNotices.value.length, 1);
    pauseFeedback(id, "focus");
    resumeFeedback(id, "hover");
    advance(10000);
    assert.equal(feedbackNotices.value.length, 1);
    resumeFeedback(id, "focus");
    advance(3999);
    assert.equal(feedbackNotices.value.length, 1);
    advance(1);
    assert.equal(feedbackNotices.value.length, 0);
    paused.close();
  });
});

test("通知达到四条上限时移除最早一条，clearFeedback 清理全部", () => {
  resetFeedback();
  withFakeClock(() => {
    const ids = Array.from({ length: 5 }, (_, index) =>
      notifyFeedback("info", `提示 ${index + 1}`)
    );
    assert.equal(feedbackNotices.value.length, 4);
    assert.deepEqual(
      feedbackNotices.value.map((notice) => notice.message),
      ["提示 2", "提示 3", "提示 4", "提示 5"]
    );
    ids[0]?.close();
    assert.equal(feedbackNotices.value.length, 4);
    clearFeedback();
    assert.equal(feedbackNotices.value.length, 0);
  });
});

test("保存单飞时只提交一次，且只发布一次成功提示", async () => {
  resetFeedback();
  const writing = pending();
  let writes = 0;
  const view = mount(
    formConfig({
      create: async (dto) => {
        writes++;
        await writing.promise;
        return { id: "created", name: dto.name };
      },
    })
  );
  const first = view.controller.save();
  const second = view.controller.save();
  await flush();
  writing.resolve();
  await Promise.all([first, second]);

  assert.equal(writes, 1);
  assert.equal(feedbackNotices.value.length, 1);
  assert.equal(feedbackNotices.value[0]?.tone, "success");
  view.close();
});

test("afterSave 失败时不发布成功提示", async () => {
  resetFeedback();
  const view = mount(
    formConfig({ afterSave: async () => Promise.reject(new Error("后处理失败")) })
  );
  await view.controller.save();

  assert.equal(feedbackNotices.value.length, 0);
  assert.match(view.controller.state.error ?? "", /保存成功，后续处理失败：后处理失败/);
  view.close();
});

test("导航失败撤销轻成功提示，并保留页面内警告所需的已提交状态", async () => {
  resetFeedback();
  const view = mount(formConfig(), { saved: async () => Promise.reject(new Error("无法跳转")) });
  await view.controller.save();

  assert.equal(feedbackNotices.value.length, 0);
  assert.equal(view.controller.state.phase, "saved");
  assert.equal(view.controller.state.mutationOutcome, "committed");
  assert.match(view.controller.state.error ?? "", /保存成功，后续处理失败：无法跳转/);
  view.close();
});

test("写入异常默认标记未知，禁止重复写入且 retrySync 不会重发请求", async () => {
  resetFeedback();
  let writes = 0;
  const view = mount(
    formConfig({
      create: async () => {
        writes++;
        throw new Error("网络中断");
      },
    })
  );
  await view.controller.save();
  await view.controller.save();
  await view.controller.retrySync();

  assert.equal(writes, 1);
  assert.equal(view.controller.state.mutationOutcome, "unknown");
  assert.equal(feedbackNotices.value.length, 0);
  view.close();
});

test("已提交但回填失败时 retrySync 只重试回填，不重发 create", async () => {
  resetFeedback();
  let writes = 0;
  let resolves = 0;
  const view = mount(
    formConfig({
      create: async (dto) => {
        writes++;
        return { id: "created", name: dto.name };
      },
      resolveSaved: async (result) => {
        resolves++;
        if (resolves === 1) throw new Error("读取失败");
        return result;
      },
    })
  );
  await view.controller.save();
  assert.equal(view.controller.state.phase, "committed-needs-sync");
  await view.controller.retrySync();

  assert.equal(writes, 1);
  assert.equal(resolves, 2);
  assert.equal(view.controller.state.phase, "saved");
  assert.equal(feedbackNotices.value.length, 1);
  view.close();
});

test("卸载后的迟到回填不会发布轻提示", async () => {
  resetFeedback();
  const resolving = pending();
  const view = mount(formConfig({ resolveSaved: async () => resolving.promise }));
  const saving = view.controller.save();
  await flush();
  view.close();
  resolving.resolve({ id: "created", name: "迟到结果" });
  await saving;

  assert.equal(feedbackNotices.value.length, 0);
});

test("后台 KeepAlive 页完成保存只更新状态，重新激活也不补发轻提示", async () => {
  resetFeedback();
  const resolving = pending();
  const view = mountKept(formConfig({ resolveSaved: async () => resolving.promise }));
  const saving = view.controller.save();
  await flush();
  await view.deactivate();
  resolving.resolve({ id: "created", name: "后台结果" });
  await saving;

  assert.equal(view.controller.state.phase, "saved");
  assert.equal(feedbackNotices.value.length, 0);
  await view.activate();
  assert.equal(feedbackNotices.value.length, 0);
  view.close();
});

test("KeepAlive 页后台后撤销当前 operation 的轻提示", async () => {
  resetFeedback();
  const view = mountKept(formConfig());
  await view.controller.save();
  assert.equal(feedbackNotices.value.length, 1);

  await view.deactivate();
  assert.equal(feedbackNotices.value.length, 0);
  view.close();
});

test("feedback.saved 为 false 时保持保存流程但不显示成功提示", async () => {
  resetFeedback();
  const view = mount(formConfig({ feedback: { saved: false } }));
  await view.controller.save();

  assert.equal(view.controller.state.phase, "saved");
  assert.equal(feedbackNotices.value.length, 0);
  view.close();
});
