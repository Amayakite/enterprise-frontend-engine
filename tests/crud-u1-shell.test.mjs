import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("U1 MyDialog 统一桌面拖拽、窄屏保护、全屏复位和可访问操作", () => {
  const source = read("src/components/common/MyDialog.vue");
  assert.match(source, /<el-dialog/);
  assert.match(source, /:draggable="canDrag"/);
  assert.match(source, /:overflow="false"/);
  assert.match(source, /useMediaQuery\("\(min-width: 768px\)"\)/);
  assert.match(source, /dialog\.value\?\.resetPosition\(\)/);
  assert.match(source, /resolvedFullscreen\.value = false/);
  assert.match(source, /aria-label="关闭"/);
  assert.match(source, /resolvedFullscreen \? ['"]还原窗口['"] : ['"]全屏显示['"]/);
});

test("U1 参照和组合查询只通过 MyDialog 打开业务弹窗", () => {
  for (const file of [
    "src/components/business/MyReference/index.vue",
    "src/components/business/search/QueryPanel.vue",
  ]) {
    const source = read(file);
    assert.match(source, /import MyDialog from/);
    assert.doesNotMatch(source, /<el-dialog/);
  }
  const reference = read("src/components/business/MyReference/index.vue");
  assert.match(reference, /:height="tableHeight"/);
  assert.match(reference, /v-model:fullscreen="dialogFullscreen"/);
  assert.match(reference, /@confirm="state\.commitIds\(state\.draftIds\.value\)"/);
});

test("U1 CRUD 命令栏、列移动、排序和表单操作区使用统一结构", () => {
  const list = read("src/components/business/crud/MyCrudList.vue");
  assert.match(list, /#commands-start/);
  assert.match(list, /#commands-end/);
  assert.match(list, /:icon="Plus"/);
  assert.match(list, /:icon="Setting"/);
  assert.doesNotMatch(list, />\s*[↑↓]\s*</);

  const settings = read("src/components/business/crud/CrudColumnSettingsDialog.vue");
  assert.match(settings, /<VueDraggable/);
  assert.match(settings, /handle="\.column-settings__unit-drag"/);
  assert.doesNotMatch(settings, /column-settings__leaf-drag/);
  assert.match(settings, /<Rank aria-hidden="true"/);
  assert.match(settings, /name: ['"]crud-column-units['"]/);
  assert.match(settings, /表头预览/);
  assert.match(settings, /name: ['"]crud-preview-units['"]/);
  assert.match(settings, /selectItem\(previewUnitColumns/);
  assert.match(settings, /<el-splitter/);
  assert.match(settings, /<el-splitter-panel/);
  assert.match(settings, /内容对齐/);
  assert.match(settings, /不可拆分/);
  assert.match(settings, /分组标题对齐/);
  assert.match(settings, /setSelectedGroupFixed/);
  assert.doesNotMatch(settings, /mergeHeaderGroup/);

  const table = read("src/components/table/MyTable.vue");
  assert.match(table, /Sort, SortDown, SortUp/);
  assert.match(table, /sortLabel\(column\.key\)/);
  assert.doesNotMatch(table, /[↕]/);

  const form = read("src/components/business/crud/MyCrudForm.vue");
  assert.match(form, /v-if="slots\.footer"/);
  assert.match(read("src/components/business/crud/MyCrudLayout.vue"), /v-if="\$slots\.footer"/);
  assert.doesNotMatch(form, /<slot name="footer"[^>]*>\s*<ActionButton/);
});

test("U1 Vite 只预构建实际使用的 VXE 入口并声明消息框自动导入", () => {
  const source = read("vite.config.ts");
  assert.doesNotMatch(source, /^\s*"xe-utils",\s*$/m);
  assert.doesNotMatch(source, /^\s*"vxe-table\/es\/locale\/lang\/zh-CN",\s*$/m);
  assert.match(source, /"ElMessageBox"/);
});
