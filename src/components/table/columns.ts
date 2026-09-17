import type { FieldDefinition } from "@/components/business/fields/types";
import type { TableColumn, TableHeaderGroup, TableViewColumn, TableViewColumnBand } from "./types";

/** 显式白名单转换；表单、查询与参照配置不会进入底层引擎。 */
export function toTableColumns<Row, C>(
  fields: readonly FieldDefinition<Row, C>[]
): TableColumn<Row>[] {
  return fields
    .filter((field) => !!field.table)
    .map((field) => {
      const table = field.table || {};
      return {
        key: field.key,
        label: field.label,
        width: table.width,
        minWidth: table.minWidth,
        align: table.align ?? (field.type === "number" ? "right" : "left"),
        sortable: table.sortable,
        slot: table.slot,
      };
    });
}

function assertHeaderGroup(group: TableHeaderGroup, definitions: Map<string, TableHeaderGroup>) {
  if (!group.key.trim() || !group.label.trim()) throw new Error("多级表头的 key 与标题不能为空");
  const known = definitions.get(group.key);
  if (
    known &&
    (known.label !== group.label || known.align !== group.align || known.fixed !== group.fixed)
  )
    throw new Error(`多级表头 ${group.key} 使用了不同配置`);
  definitions.set(group.key, group);
}

/**
 * 按当前可见列顺序组装两层表头。只合并相邻且固定区域一致的分组，
 * 因此列偏好调整顺序/固定位置后仍不会改变叶子列语义。
 */
export function buildTableColumnBands<Row>(
  columns: readonly TableViewColumn<Row>[]
): TableViewColumnBand<Row>[] {
  const bands: TableViewColumnBand<Row>[] = [];
  const definitions = new Map<string, TableHeaderGroup>();
  columns.forEach((column, index) => {
    const group = column.headerGroup;
    if (!group) {
      bands.push({ key: `column-${column.key}`, fixed: column.fixed, columns: [{ ...column }] });
      return;
    }
    assertHeaderGroup(group, definitions);
    const fixed = Object.prototype.hasOwnProperty.call(column, "fixed")
      ? column.fixed
      : group.fixed;
    const previous = bands.at(-1);
    if (
      previous?.group?.key === group.key &&
      previous.group.label === group.label &&
      previous.fixed === fixed
    ) {
      previous.columns.push({ ...column });
      return;
    }
    bands.push({
      key: `group-${group.key}-${fixed ?? "none"}-${index}`,
      group: { ...group },
      fixed,
      columns: [{ ...column }],
    });
  });
  return bands;
}
