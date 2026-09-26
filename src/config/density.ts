/** 全局界面密度；仅改变显示，不改变字段、校验与业务数据。 */
export type LayoutDensity =
  | "extra-compact"
  | "compact"
  | "default"
  | "comfortable"
  | "extra-comfortable";

/** 外观面板从紧到松的五档选择，所有页面实时使用同一档。 */
export const layoutDensityOptions = [
  { value: "extra-compact", label: "更紧凑", description: "高效浏览，最少留白" },
  { value: "compact", label: "紧凑", description: "密集录入，减少滚动" },
  { value: "default", label: "默认", description: "平衡信息量与阅读空间" },
  { value: "comfortable", label: "宽松", description: "舒展间距，便于核对" },
  { value: "extra-comfortable", label: "更宽松", description: "更大操作区域，轻松阅读" },
] as const;

/**
 * 读取保存的界面密度，未知或空值使用默认档。
 * @param value 本机保存的字符串；接受五个 LayoutDensity 值。
 * @returns 可用于外观设置和根节点 data-density 的密度名称。
 * @example
 * `normalizeLayoutDensity("compact") // "compact"`
 */
export function normalizeLayoutDensity(value: unknown): LayoutDensity {
  return layoutDensityOptions.find((option) => option.value === value)?.value ?? "default";
}

/**
 * 将全局密度映射到 Element Plus 公开 size；页面留白仍由密度 token 控制。
 * @param value 外观设置的五档密度。
 * @returns 紧凑两档 small、默认档 default、宽松两档 large。
 * @example
 * `densityComponentSize("comfortable") // "large"`
 */
export function densityComponentSize(value: LayoutDensity): "small" | "default" | "large" {
  if (value === "extra-compact" || value === "compact") return "small";
  if (value === "comfortable" || value === "extra-comfortable") return "large";
  return "default";
}
