import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import "./reference-harness.mjs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/api/base/sale")
      return { url: "data:text/javascript,export default {};", shortCircuit: true };
    if (specifier === "axios")
      return {
        url: "data:text/javascript,export const isAxiosError = () => false;",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

const { saleModule } = await import("../src/pages/base/sale/config.ts");

test("Sale 保留字段顺序、编辑校验及详情状态语义", () => {
  assert.deepEqual(
    saleModule.fields.map(({ key, label, type, props, form, scenes }) => ({
      key,
      label,
      type,
      props,
      form,
      scenes:
        typeof scenes?.detail?.format === "function"
          ? {
              ...scenes,
              detail: { format: [scenes.detail.format(false), scenes.detail.format(true)] },
            }
          : scenes,
    })),
    [
      {
        key: "code",
        label: "组织编码",
        type: "text",
        props: { maxlength: 30 },
        form: { required: true },
        scenes: {
          list: { width: 160, sortable: true },
          detail: true,
          query: { normal: true, advanced: true, keyword: true },
        },
      },
      {
        key: "name",
        label: "组织名称",
        type: "text",
        props: { maxlength: 80 },
        form: { required: true },
        scenes: {
          list: { minWidth: 220, link: "detail", sortable: true },
          detail: true,
          query: { normal: true, advanced: true, keyword: true },
        },
      },
      {
        key: "active",
        label: "启用",
        type: "switch",
        props: undefined,
        form: {},
        scenes: {
          list: { width: 100 },
          detail: { format: ["已停用", "已启用"] },
          query: { normal: true, advanced: true },
        },
      },
      {
        key: "remark",
        label: "备注",
        type: "textarea",
        props: { maxlength: 300 },
        form: { span: 2 },
        scenes: { detail: { span: 2 } },
      },
    ]
  );
});

test("Sale 标准列表与详情由 CRUD 组件自动挂载 drawer 宿主", () => {
  for (const page of ["src/pages/base/sale/index.vue", "src/pages/base/sale/detail.vue"]) {
    const source = readFileSync(page, "utf8");
    assert.equal(
      source.match(/<MyBusinessPageHost v-if="bindings\.host" v-bind="bindings\.host"\s*\/>/g)
        ?.length ?? 0,
      0,
      page
    );
    assert.doesNotMatch(source, /MyBusinessPageHost/);
  }
  for (const component of [
    "src/components/business/crud/MyCrudList.vue",
    "src/components/business/crud/MyCrudDetail.vue",
  ]) {
    const source = readFileSync(component, "utf8");
    assert.match(source, /<MyBusinessPageHost v-if="host" v-bind="host"\s*\/>/);
  }
});
