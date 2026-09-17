import Decimal from "decimal.js";

/** 可被 Decimal.js 精确解析的输入类型；金额提交优先使用 string，避免浮点误差。 */
export type DecimalValue = Decimal.Value;
export type DecimalRounding = Decimal.Rounding;

export const DEFAULT_DECIMAL_PLACES = 2;

/** 金额校验与展示的共享选项。 */
export interface MoneyOptions {
  /** 小数位数，默认 2。 */
  precision?: number;
  /** 允许的最小金额，包含边界。 */
  min?: DecimalValue;
  /** 允许的最大金额，包含边界。 */
  max?: DecimalValue;
  /** 是否允许负数，默认 false。 */
  allowNegative?: boolean;
}

/** 业务输入的十进制字符串；不接受空白、指数、进制前缀或 Infinity。 */
export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
}

/**
 * 校验可提交的金额字符串：不接受千分位、科学计数法和超出货币精度的值。
 * 此函数只校验，不悄悄截断或四舍五入用户输入。
 */
export function isMoneyString(value: unknown, options: MoneyOptions = {}): value is string {
  const precision = options.precision ?? DEFAULT_DECIMAL_PLACES;
  if (!Number.isInteger(precision) || precision < 0 || !isDecimalString(value)) return false;
  const fraction = precision === 0 ? "" : `(?:\\.\\d{1,${precision}})?`;
  const expression = options.allowNegative
    ? new RegExp(`^-?(?:\\d+)${fraction}$`)
    : new RegExp(`^(?:\\d+)${fraction}$`);
  if (!expression.test(value)) return false;
  try {
    const decimal = toDecimal(value);
    if (!options.allowNegative && decimal.isNegative()) return false;
    if (options.min !== undefined && decimal.lessThan(options.min)) return false;
    if (options.max !== undefined && decimal.greaterThan(options.max)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 项目内的 Decimal 构造器。
 *
 * 使用 clone 避免修改第三方库的全局配置；40 位有效数字覆盖常规业务计算，
 * 默认采用常见的四舍五入（ROUND_HALF_UP）。服务端仍需按业务规则复核金额。
 */
export const BusinessDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

function assertDecimalPlaces(decimalPlaces: number): void {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 1_000_000_000) {
    throw new RangeError("decimalPlaces 必须是 0 到 1000000000 之间的整数");
  }
}

/**
 * 将 number、string、bigint 或 Decimal 转成项目统一的 Decimal 实例。
 *
 * @param value 待计算的十进制值。
 * @returns 使用 BusinessDecimal 配置创建的实例。
 * @throws 输入无法被 Decimal.js 解析时抛出。
 * @example `const total = toDecimal("12.30").plus("0.70");`
 */
export function toDecimal(value: DecimalValue): Decimal {
  return new BusinessDecimal(value);
}

/**
 * 精确求和；空集合返回 0。
 * @example `sumDecimals(["12.30", "0.70"]).toString()`
 */
export function sumDecimals(values: Iterable<DecimalValue>): Decimal {
  let total = new BusinessDecimal(0);
  for (const value of values) total = total.plus(value);
  return total;
}

/**
 * 按指定小数位舍入，默认保留两位并采用四舍五入。
 * 返回 Decimal，便于继续参与精确计算。
 */
export function roundDecimal(
  value: DecimalValue,
  decimalPlaces: number = DEFAULT_DECIMAL_PLACES,
  rounding: DecimalRounding = Decimal.ROUND_HALF_UP
): Decimal {
  assertDecimalPlaces(decimalPlaces);
  return toDecimal(value).toDecimalPlaces(decimalPlaces, rounding);
}

/**
 * 按指定小数位输出定点字符串，避免转换为 number 时损失精度。
 * @example `toFixedDecimal("12.345", 2) // "12.35"`
 */
export function toFixedDecimal(
  value: DecimalValue,
  decimalPlaces: number = DEFAULT_DECIMAL_PLACES,
  rounding: DecimalRounding = Decimal.ROUND_HALF_UP
): string {
  assertDecimalPlaces(decimalPlaces);
  return toDecimal(value).toFixed(decimalPlaces, rounding);
}

/**
 * 精确格式化人民币金额，不先转成 number。
 * 仅负责当前项目既有的“¥ + 千分位 + 固定小数位”展示格式。
 */
export function formatDecimalCurrency(
  value: DecimalValue,
  decimalPlaces: number = DEFAULT_DECIMAL_PLACES
): string {
  const formatted = toFixedDecimal(value, decimalPlaces).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `¥${formatted}`;
}

/**
 * 以指定货币符号展示金额；计算、存储和提交仍保留原始十进制字符串。
 * @example `formatMoney("1234.5", { currency: "¥", precision: 2 }) // "¥1,234.50"`
 */
export function formatMoney(
  value: DecimalValue,
  options: Pick<MoneyOptions, "precision"> & { currency?: string } = {}
): string {
  const formatted = toFixedDecimal(value, options.precision ?? DEFAULT_DECIMAL_PLACES).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );
  return `${options.currency ?? "¥"}${formatted}`;
}

/**
 * 两数相加
 */
export function addDecimals(a: DecimalValue, b: DecimalValue): Decimal {
  return toDecimal(a).plus(b);
}

/**
 * 两数相减
 */
export function subtractDecimals(a: DecimalValue, b: DecimalValue): Decimal {
  return toDecimal(a).minus(b);
}

/**
 * 两数相乘
 */
export function multiplyDecimals(a: DecimalValue, b: DecimalValue): Decimal {
  return toDecimal(a).times(b);
}

/**
 * 两数相除
 */
export function divideDecimals(a: DecimalValue, b: DecimalValue): Decimal {
  return toDecimal(a).dividedBy(b);
}
