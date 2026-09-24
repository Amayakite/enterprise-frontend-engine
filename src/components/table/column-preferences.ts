import type { TableColumn, TableHeaderGroup } from "./types";

/** 列固定位置；none 表示跟随表格横向滚动。 */
export type CrudColumnFixed = "left" | "none" | "right";
/** 表格行密度，默认 compact。 */
export type CrudColumnDensity = "compact" | "comfortable";
/** 单元格或分组标题的对齐方向。 */
export type CrudColumnAlign = "left" | "center" | "right";
/** 用户可保存的列外观，不包含业务行数据。 */
export interface CrudColumnPreference {
  /** 对应 TableColumn.key，只接受模块声明的列。 */
  key: string;
  /** 是否显示；应用后的整张表必须至少有一列可见。 */
  visible: boolean;
  /** 列宽，单位像素，允许 64–1000；编辑时 undefined 表示清除显式宽度。 */
  width?: number;
  /** left/none/right；同一分组的列保持一致。 */
  fixed: CrudColumnFixed;
  /** 单元格对齐，默认取模块配置或 left。 */
  align: CrudColumnAlign;
  /** 分组标题对齐；普通列省略，分组默认取配置或 center。 */
  groupAlign?: CrudColumnAlign;
}

/** 排好顺序的一组列偏好；设置面板用它构造拖动单元。 */
export interface ColumnPreferenceGroup {
  /** 模块原始表头分组；独立列没有 group。 */
  group?: TableHeaderGroup;
  /** 新建的可编辑副本，同组字段按模块顺序排列。 */
  items: CrudColumnPreference[];
}

/** 检查用户列宽，读取旧设置、提交设置和单列调整共用相同范围。 */
export function validColumnWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 64 && value <= 1000;
}

/** 对齐值不在允许范围内时，使用调用方指定的模块默认值。 */
function align(value: unknown, fallback: CrudColumnAlign): CrudColumnAlign {
  return value === "left" || value === "center" || value === "right" ? value : fallback;
}

/**
 * 按左、中、右固定区整理列，并保持同组字段不可拆分；不修改输入。
 * @param columns 模块原始列配置，决定组内顺序及默认标题对齐。
 * @param items 当前列偏好；返回独立副本，可直接作为设置弹窗草稿。
 * @returns 按显示顺序排列的分组，独立列作为单成员组。
 */
export function groupColumnPreferences<Row>(
  columns: readonly TableColumn<Row>[],
  items: readonly CrudColumnPreference[]
): ColumnPreferenceGroup[] {
  /** 一次建立索引，后面按稳定 key 找分组和声明顺序。 */
  const sources = new Map(
    columns.map((column, index) => [column.key as string, { column, index }])
  );
  const groups: ColumnPreferenceGroup[] = [];
  const collected = new Map<string, ColumnPreferenceGroup>();
  for (const fixed of ["left", "none", "right"] as const) {
    for (const item of items) {
      if (item.fixed !== fixed) continue;
      const group = sources.get(item.key)?.column.headerGroup;
      if (!group) {
        groups.push({ items: [{ ...item }] });
        continue;
      }
      let unit = collected.get(group.key);
      if (!unit) {
        unit = { group, items: [] };
        collected.set(group.key, unit);
        groups.push(unit);
      }
      unit.items.push({ ...item });
    }
  }
  // 组内第一声明列决定整组固定区和标题对齐，存储和预览使用同一规则。
  for (const unit of collected.values()) {
    unit.items.sort((a, b) => sources.get(a.key)!.index - sources.get(b.key)!.index);
    const anchor = unit.items[0]!;
    for (const item of unit.items) {
      item.fixed = anchor.fixed;
      item.groupAlign =
        anchor.groupAlign ?? sources.get(anchor.key)?.column.headerGroup?.align ?? "center";
    }
  }
  return (["left", "none", "right"] as const).flatMap((fixed) =>
    groups.filter((unit) => unit.items[0]?.fixed === fixed)
  );
}

/**
 * 清理旧列设置或设置面板提交值，过滤未知/重复列并补齐模块新增列。
 * @param columns 当前模块的列白名单。
 * @param values 待检查的列表；每项单独验证，损坏项跳过。
 * @param defaults 已按模块规则生成的默认值，用于补上缺少的列。
 * @param origin storage 缺少宽度时恢复模块默认；editor 允许清除显式宽度。
 * @returns 合法偏好列表；全隐藏如何处理由调用方决定，不在这里改写用户选择。
 */
export function normalizeColumnPreferences<Row>(
  columns: readonly TableColumn<Row>[],
  values: readonly unknown[],
  defaults: readonly CrudColumnPreference[],
  origin: "storage" | "editor"
): CrudColumnPreference[] {
  const allowed = new Map(columns.map((column) => [column.key as string, column]));
  const seen = new Set<string>();
  const parsed: CrudColumnPreference[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const key: unknown = Reflect.get(value, "key");
    if (typeof key !== "string" || seen.has(key)) continue;
    const source = allowed.get(key);
    if (!source) continue;
    seen.add(key);
    const width: unknown = Reflect.get(value, "width");
    const fixed: unknown = Reflect.get(value, "fixed");
    parsed.push({
      key,
      visible: Reflect.get(value, "visible") !== false,
      width:
        validColumnWidth(width) || (origin === "editor" && width === undefined)
          ? width
          : source.width,
      fixed:
        fixed === "left" || fixed === "right" || fixed === "none"
          ? fixed
          : (source.fixed ?? "none"),
      align: align(Reflect.get(value, "align"), source.align ?? "left"),
      groupAlign: source.headerGroup
        ? align(Reflect.get(value, "groupAlign"), source.headerGroup.align ?? "center")
        : undefined,
    });
  }
  return [
    ...parsed,
    ...defaults.filter((item) => !seen.has(item.key)).map((item) => ({ ...item })),
  ];
}

/**
 * 将一列偏好合入业务配置，正式表格和设置预览共用；隐藏或不存在的列返回 undefined。
 * @param column 模块原始列，不会被修改。
 * @param item 当前已规范化的列偏好。
 * @returns 新的显示列，保留模块格式化等业务配置。
 */
export function applyColumnPreference<Row>(
  column: TableColumn<Row> | undefined,
  item: CrudColumnPreference
): TableColumn<Row> | undefined {
  if (!column || !item.visible) return;
  return {
    ...column,
    width: item.width,
    fixed: item.fixed === "none" ? undefined : item.fixed,
    align: item.align,
    headerGroup: column.headerGroup
      ? {
          ...column.headerGroup,
          fixed: item.fixed === "none" ? undefined : item.fixed,
          align: item.groupAlign ?? column.headerGroup.align ?? "center",
        }
      : undefined,
  };
}
