import type { FieldDefinition, FieldEnvironment } from "./types";

const formats: Readonly<
  Record<
    string,
    {
      /**
       * 格式说明短文案；用于字段帮助提示，不改变实际校验规则。
       */
      hint: string;
      /**
       * 展示给用户的示例输入；不是默认模型值。
       * @example
       * `example: "例如 13800138000"`
       */
      example: string;
    }
  >
> = {
  email: { hint: "请填写有效邮箱地址", example: "例如 name@example.com" },
  mobile: { hint: "中国大陆 11 位手机号码", example: "例如 13800138000" },
  phone: { hint: "填写联系电话", example: "例如 010-12345678" },
  decimal: { hint: "十进制数字，不使用千分位或科学计数法", example: "例如 123.45" },
  money: { hint: "金额最多保留两位小数，不使用千分位或科学计数法", example: "例如 123.45" },
  date: { hint: "日期格式 YYYY-MM-DD", example: "例如 2026-09-10" },
  datetime: { hint: "日期时间格式 YYYY-MM-DD HH:mm:ss", example: "例如 2026-09-10 09:30:00" },
  month: { hint: "月份格式 YYYY-MM", example: "例如 2026-09" },
  year: { hint: "年份格式 YYYY", example: "例如 2026" },
};
/** 按字段 placeholder、旧 props.placeholder、格式示例的优先级取得输入提示。 */
export function fieldPlaceholder(field: {
  /**
   * 输入框未填写时的提示；建议具体说明内容，不能替代 label 或校验。
   * @example
   * `placeholder: "请输入客户名称"`
   */
  placeholder?: string;

  /**
   * 格式提示标识或自定义说明；内置 mobile/email/money/date 等，不会自动替代校验。
   * @example
   * `formatHint: "mobile"`
   */
  formatHint?: string;

  /**
   * 当前字段编辑器允许的属性；按类型提示填写，不传任意 Element Plus 私有属性。
   */
  props?: object;
}) {
  const legacy =
    field.props && "placeholder" in field.props && typeof field.props.placeholder === "string"
      ? field.props.placeholder
      : undefined;
  return (
    field.placeholder ??
    legacy ??
    (field.formatHint ? formats[field.formatHint]?.example : undefined)
  );
}
/** 合并帮助文本、格式说明与只读原因，去除重复项；不改变字段校验行为。 */
export function fieldHelpText<M, C>(
  field: FieldDefinition<M, C>,
  env?: FieldEnvironment<M, C>,
  readonly = false
) {
  const format = field.formatHint ? (formats[field.formatHint]?.hint ?? field.formatHint) : "";
  return [
    ...new Set(
      [field.help, format, readonly && env ? field.readonlyReason?.(env) : undefined].filter(
        Boolean
      )
    ),
  ].join("；");
}
