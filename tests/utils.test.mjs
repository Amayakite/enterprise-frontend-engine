import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  formatDecimalCurrency,
  formatMoney,
  isMoneyString,
  sumDecimals,
  roundDecimal,
  toFixedDecimal,
} = await import("../src/utils/decimal.ts");
const {
  formatDate,
  formatDateTime,
  formatMonth,
  formatYear,
  isDateInRange,
  isValidDateRange,
  parseDate,
} = await import("../src/utils/date.ts");

test("Decimal 工具保持小数精度并统一四舍五入", () => {
  assert.equal(sumDecimals(["0.1", "0.2"]).toString(), "0.3");
  assert.equal(roundDecimal("19.995").toString(), "20");
  assert.equal(toFixedDecimal("19.995"), "20.00");
  assert.equal(formatDecimalCurrency("1234567.8"), "¥1,234,567.80");
  assert.throws(() => toFixedDecimal("1", -1), RangeError);
  assert.equal(isMoneyString("12.34"), true);
  assert.equal(isMoneyString("12.345"), false);
  assert.equal(isMoneyString("1e2"), false);
  assert.equal(isMoneyString("-1.00"), false);
  assert.equal(isMoneyString("-1.00", { allowNegative: true }), true);
  assert.equal(formatMoney("1234.5", { currency: "￥" }), "￥1,234.50");
});

test("日期工具严格解析指定格式并为无效值提供回退", () => {
  assert.equal(parseDate("2026-02-28", "YYYY-MM-DD")?.format("YYYYMMDD"), "20260228");
  assert.equal(parseDate("2026-02-30", "YYYY-MM-DD"), null);
  assert.equal(formatDate("2026-09-09T13:14:15"), "2026-09-09");
  assert.equal(formatDateTime("2026-09-09T13:14:15"), "2026-09-09 13:14:15");
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("invalid", "YYYY-MM-DD", ""), "");
  assert.equal(formatMonth("2026-09", ""), "2026-09");
  assert.equal(formatYear("2026", ""), "2026");
});

test("日期区间判断包含边界并拒绝无效或颠倒的区间", () => {
  assert.equal(isDateInRange("2026-09-09", "2026-09-09", "2026-09-10", "day"), true);
  assert.equal(isDateInRange("2026-09-11", "2026-09-09", "2026-09-10", "day"), false);
  assert.equal(isDateInRange("2026-09-09", "2026-09-10", "2026-09-09", "day"), false);
  assert.equal(isDateInRange("invalid", "2026-09-09", "2026-09-10"), false);
  assert.equal(isValidDateRange(["2026-09-09", "2026-09-10"]), true);
  assert.equal(isValidDateRange(["2026-09-10", "2026-09-09"]), false);
  assert.equal(isValidDateRange(["2026-13", "2026-14"], "YYYY-MM"), false);
});
