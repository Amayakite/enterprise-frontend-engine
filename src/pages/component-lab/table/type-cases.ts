import type {
  MyTableExpose,
  TableColumn,
  TableSort,
  TableEngineOptions,
} from "@/components/table/types";
import type { OrderLine } from "./types";

function typeCases(table: MyTableExpose<OrderLine, string>) {
  void table.startEdit("client-key", "productId");
  // @ts-expect-error 定位字段必须属于行模型
  void table.focusCell("client-key", "missing");
  // @ts-expect-error 稳定行键不能混入数字
  void table.startEdit(0);
  const column: TableColumn<OrderLine> = {
    // @ts-expect-error 列键必须属于行模型
    key: "missing",
    label: "错误列",
  };
  const sort: TableSort<OrderLine> = {
    key: "price",
    // @ts-expect-error 排序方向仅允许 asc/desc，清排序单独传 null
    order: "ascending",
  };
  const options: TableEngineOptions = {
    // @ts-expect-error 核心 props 和事件不可被 engineOptions 覆盖
    data: [],
  };
  return { column, sort, options };
}
void typeCases;
