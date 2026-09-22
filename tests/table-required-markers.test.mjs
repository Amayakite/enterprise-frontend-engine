import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import "./reference-harness.mjs";
const { normalizeFields } = await import("../src/components/business/fields/normalize.ts");
const source = readFileSync("src/components/table/MyTable.vue", "utf8");
const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1];
const ast = ts.createSourceFile("MyTable.ts", script, ts.ScriptTarget.Latest, true);
const functions = ast.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ["fixedRequired", "dynamicRequired"].includes(node.name?.text)
  )
  .map((node) => node.getText(ast))
  .join("\n");
assert.equal(
  ast.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ["fixedRequired", "dynamicRequired"].includes(node.name?.text)
  ).length,
  2
);
const compiled = ts.transpileModule(functions, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;
const create = new Function(
  "props",
  "fieldFor",
  "environment",
  "normalizeFields",
  `${compiled}; return { fixedRequired, dynamicRequired };`
);

test("展示列表和详情子表不呈现必填标记，也不执行行级必填条件", () => {
  let evaluated = 0;
  const fields = [
    { key: "name", label: "名称", type: "text", form: { required: true } },
    {
      key: "code",
      label: "编码",
      type: "text",
      form: {
        required: () => {
          evaluated++;
          return true;
        },
      },
    },
  ];
  const props = { edit: false };
  const markers = create(
    props,
    (key) => fields.find((field) => field.key === key),
    (model) => ({ model, context: undefined, mode: "edit" }),
    normalizeFields
  );
  for (const edit of [false, undefined]) {
    props.edit = edit;
    assert.equal(markers.fixedRequired("name"), false);
    assert.equal(markers.dynamicRequired("code", {}), false);
  }
  assert.equal(evaluated, 0);
  props.edit = {};
  assert.equal(markers.fixedRequired("name"), true);
  assert.equal(markers.dynamicRequired("code", {}), true);
  assert.equal(evaluated, 1);
  props.edit = false;
  assert.equal(markers.fixedRequired("name"), false);
  assert.equal(markers.dynamicRequired("code", {}), false);
});
