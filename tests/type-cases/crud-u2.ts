// 仅供 U2 公开编辑呈现合同编译验收；不进入应用。
import type { TableEdit } from "@/components/table/types";

interface Row {
  id: string;
  name: string;
}

const inline: TableEdit<Row, undefined> = {
  createInitialRow: () => ({ id: "row-1", name: "" }),
  presentation: "inline",
};
const dialog: TableEdit<Row, undefined> = {
  createInitialRow: () => ({ id: "row-2", name: "" }),
  presentation: "dialog",
  dialog: { title: (row) => `编辑 ${row.name}`, width: "760px", columns: 2 },
};
const wrongPresentation: TableEdit<Row, undefined> = {
  createInitialRow: () => ({ id: "row-3", name: "" }),
  // @ts-expect-error 仅支持已实现的 inline 或 dialog
  presentation: "popover",
};
const wrongColumns: TableEdit<Row, undefined> = {
  createInitialRow: () => ({ id: "row-4", name: "" }),
  presentation: "dialog",
  // @ts-expect-error 弹窗表单只支持一至三列
  dialog: { columns: 4 },
};
void [inline, dialog, wrongPresentation, wrongColumns];
