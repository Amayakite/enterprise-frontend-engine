import { performance } from "node:perf_hooks";
import { createRenderer, h, reactive, nextTick } from "vue";
import "../reference-harness.mjs";
const { useFormModel } = await import("../../src/components/business/MyForm/useFormModel.ts");

// 测量真实表单模型的受控回写；不含 DOM、网络和主机 GC，不能当作页面帧率。
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
const results = [];
function mountForm(size, immutableModel) {
  const initial = () => ({
    name: "",
    lines: Array.from({ length: size }, (_, id) => ({
      id,
      name: `明细-${id}`,
      quantity: 1,
      remark: "用于性能回归的明细数据",
    })),
  });
  const props = reactive({
    modelValue: initial(),
    context: {},
    createInitialModel: initial,
    immutableModel,
  });
  let form;
  const app = renderer.createApp({
    setup() {
      form = useFormModel(props, (value) => {
        props.modelValue = value;
      });
      return () => h("div");
    },
  });
  app.mount({});
  return { app, form };
}
for (const immutableModel of [false, true])
  for (const size of [0, 100, 500]) {
    const { app, form } = mountForm(size, immutableModel);
    const samples = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      form.applyPatch({ name: `输入-${i}` }, "user", "name");
      await nextTick();
      if (i >= 20) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    results.push({
      mode: immutableModel ? "CRUD" : "兼容原位修改",
      rows: size,
      samples: samples.length,
      medianMs: +samples[50].toFixed(3),
      p95Ms: +samples[95].toFixed(3),
    });
    app.unmount();
  }
console.table(results);

// 多实例仅测模型/订阅释放趋势，不包含浏览器 DOM/显存；结果供人工比较，不以堆数值断言泄漏。
if (globalThis.gc) {
  for (let i = 0; i < 10; i++) mountForm(500, true).app.unmount();
  await new Promise(setImmediate);
  globalThis.gc();
  const baseline = process.memoryUsage().heapUsed;
  const heap = [];
  for (let batch = 1; batch <= 5; batch++) {
    for (let i = 0; i < 20; i++) {
      const view = mountForm(500, true);
      view.form.applyPatch({ name: "资源释放回归" });
      await nextTick();
      view.app.unmount();
    }
    await new Promise(setImmediate);
    globalThis.gc();
    heap.push({
      closedInstances: batch * 20,
      heapDeltaKiB: +((process.memoryUsage().heapUsed - baseline) / 1024).toFixed(1),
    });
  }
  console.table(heap);
} else console.log("传入 --expose-gc 可追加多实例销毁后的堆趋势观察。");
