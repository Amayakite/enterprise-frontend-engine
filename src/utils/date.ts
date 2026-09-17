import dayjs, { type ConfigType, type Dayjs, type OpUnitType } from "dayjs";
import "dayjs/locale/zh-cn.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(customParseFormat);
dayjs.locale("zh-cn");

/** Day.js 可接受的日期输入；业务 DTO 日期通常保持 string。 */
export type DateValue = ConfigType;

export const DATE_FORMAT = "YYYY-MM-DD";
export const DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
export const MONTH_FORMAT = "YYYY-MM";
export const YEAR_FORMAT = "YYYY";
export const EMPTY_DATE_TEXT = "—";

function hasDateValue(value: DateValue): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * 将日期输入解析成 Dayjs；空值和无效日期返回 null。
 * 提供 inputFormat 时执行严格解析，避免 2026-02-30 被自动滚动到下个月。
 * 未提供格式时沿用 Day.js 对 ISO 字符串、时间戳、Date 和 Dayjs 的解析规则。
 */
export function parseDate(value: DateValue, inputFormat?: string): Dayjs | null {
  if (!hasDateValue(value)) return null;

  const parsed = inputFormat ? dayjs(value, inputFormat, true) : dayjs(value);
  return parsed.isValid() ? parsed : null;
}

/** 格式化日期；空值或无效输入返回 fallback。按浏览器本地时区解释输入。 */
export function formatDate(
  value: DateValue,
  outputFormat: string = DATE_FORMAT,
  fallback: string = EMPTY_DATE_TEXT
): string {
  return parseDate(value)?.format(outputFormat) ?? fallback;
}

/** 格式化日期时间；空值或无效输入返回 fallback。按浏览器本地时区解释输入。 */
export function formatDateTime(
  value: DateValue,
  outputFormat: string = DATE_TIME_FORMAT,
  fallback: string = EMPTY_DATE_TEXT
): string {
  return formatDate(value, outputFormat, fallback);
}

/**
 * 格式化月份；输入无效时返回 fallback。
 * @example `formatMonth("2026-03-01") // "2026-03"`
 */
export function formatMonth(value: DateValue, fallback: string = EMPTY_DATE_TEXT): string {
  return formatDate(value, MONTH_FORMAT, fallback);
}

/**
 * 格式化年份；输入无效时返回 fallback。
 * @example `formatYear("2026-03-01") // "2026"`
 */
export function formatYear(value: DateValue, fallback: string = EMPTY_DATE_TEXT): string {
  return formatDate(value, YEAR_FORMAT, fallback);
}

/**
 * 严格校验同一粒度的闭区间，拒绝缺项、无效值和逆序。
 * @param value 双元素日期字符串数组。
 * @param format 输入粒度，例如 DATE_FORMAT、MONTH_FORMAT 或 YEAR_FORMAT。
 * @example `isValidDateRange(["2026-01-01", "2026-01-31"]) // true`
 */
export function isValidDateRange(
  value: unknown,
  format: string = DATE_FORMAT
): value is readonly [string, string] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [start, end] = value;
  if (typeof start !== "string" || typeof end !== "string") return false;
  const startDate = parseDate(start, format);
  const endDate = parseDate(end, format);
  return !!startDate && !!endDate && !startDate.isAfter(endDate);
}

/**
 * 判断日期是否位于闭区间 [start, end]；任一输入无效或起止顺序颠倒时返回 false。
 * @example `isDateInRange("2026-01-15", "2026-01-01", "2026-01-31") // true`
 */
export function isDateInRange(
  value: DateValue,
  start: DateValue,
  end: DateValue,
  unit: OpUnitType = "millisecond"
): boolean {
  const currentDate = parseDate(value);
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!currentDate || !startDate || !endDate || startDate.isAfter(endDate, unit)) return false;

  return !currentDate.isBefore(startDate, unit) && !currentDate.isAfter(endDate, unit);
}

export { dayjs };
export type { Dayjs };
