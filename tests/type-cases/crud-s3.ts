import { useCrudTableChild } from "@/composables/useCrudTableChild";
import type {
  CrudColumn,
  CrudFormController,
  CrudFormSlots,
  CrudListController,
  CrudListSlots,
} from "@/components/business/crud/types";
interface Line {
  id: number;
  name: string;
  quantity: number;
}
interface Model {
  name: string;
  lines: Line[];
  tags: string[];
}
interface Entity extends Model {
  id: number;
  version: number;
}
const schema = {
  name: { label: "名称", kind: "text", entries: ["quick"], operators: ["contains"] },
} as const;
declare const form: CrudFormController<Model, Entity, number>;
declare const list: CrudListController<Entity, number, typeof schema>;
const child = useCrudTableChild(form, "lines");
child.replace([{ id: 0, name: "明细", quantity: 1 }]);
// @ts-expect-error 对象数组中的数量必须为 number
child.replace([{ id: 0, name: "明细", quantity: "1" }]);
// @ts-expect-error 文本字段不能登记成表格子模块
useCrudTableChild(form, "name");
// @ts-expect-error 原始字符串数组不能登记成对象行表格
useCrudTableChild(form, "tags");
// @ts-expect-error 类型确定的 ID 不转成字符串
form.open({ mode: "edit", id: "0" });
// @ts-expect-error 只读模型不能直接写入
form.state.model.lines[0]!.quantity = 2;
// @ts-expect-error 只读子模块数据不能直接写入
child.rows.push({ id: 1, name: "", quantity: 1 });
// @ts-expect-error 查询不能用非法入口替代定版草稿
list.setDraft({ keyword: "test" });
const column: CrudColumn<Entity> = {
  key: "name",
  label: "名称",
  link: "detail",
  secondary: "version",
};
// @ts-expect-error 第二行列必须是 Row 的真实字段
const badColumn: CrudColumn<Entity> = { key: "name", label: "名称", secondary: "unknown" };
const slots: CrudFormSlots<Model, Entity, number> = {
  "field-name": ({ value, update }) => {
    update(value.toUpperCase());
    return null;
  },
};
const listSlots: CrudListSlots<Entity, number, typeof schema> = {
  "column-version": ({ value }) => value.toFixed(0),
};
const invalid: CrudFormSlots<Model, Entity, number> = {
  "field-name": ({ update }) => {
    // @ts-expect-error 字段插槽的更新值保持字段类型
    update(1);
    return null;
  },
};
void [column, badColumn, slots, listSlots, invalid];
