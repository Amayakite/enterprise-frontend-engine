import { richTextContent } from "./rich-text";
import type { ReferenceValidationBatch } from "./types";
import Schema from "async-validator";
import type { FormItemRule } from "element-plus";
import { normalizeFields } from "./normalize";
import { VALIDATORS } from "@/utils/validate";
import { isEmptyValue } from "@/utils/validate";
import { isDecimalString, isMoneyString } from "@/utils/decimal";
import {
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  MONTH_FORMAT,
  YEAR_FORMAT,
  isValidDateRange,
  parseDate,
} from "@/utils/date";
import type { FieldDefinition, FieldEnvironment, FieldValidationResult } from "./types";

/** 将业务字段必填、格式和自定义校验转换为表单规则；保持公共提示与验证一致。 */
export function createFieldRules<M, C>(
  field: FieldDefinition<M, C>,
  form: {
    /**
     * 是否必填；由字段规则归一化得出，false 仍可能有格式校验。
     */
    required: boolean;
    /**
     * Element Plus 表单规则数组；复杂校验应返回明确错误，不在 validator 中保存数据。
     */
    rules: FormItemRule[];
  }
): FormItemRule[] {
  const { label, formatHint } = field;
  const semantic: FormItemRule[] = [];
  if (field.type === "rich" && (form.required || field.props?.maxlength !== undefined)) {
    semantic.push({
      trigger: "blur",
      validator: (_rule, value: unknown, callback) => {
        const content = richTextContent(value);
        const max = field.props?.maxlength;
        const message =
          form.required && !content.hasContent
            ? `请填写${label}`
            : max !== undefined && content.text.length > max
              ? `${label}最多填写${max}个字符`
              : undefined;
        callback(message ? new Error(message) : undefined);
      },
    });
  }
  if (formatHint === "email") semantic.push(VALIDATORS.email);
  if (formatHint === "mobile") semantic.push(VALIDATORS.mobile);
  if (
    ["decimal", "date", "datetime", "month", "year", "money"].includes(formatHint ?? "") ||
    ["date", "datetime", "month", "year", "dateRange", "amount"].includes(field.type)
  )
    semantic.push({
      trigger: "blur",
      validator: (_rule, value: unknown, callback) => {
        const calendarFormat =
          field.type === "datetime" || formatHint === "datetime"
            ? DATE_TIME_FORMAT
            : field.type === "month" || formatHint === "month"
              ? MONTH_FORMAT
              : field.type === "year" || formatHint === "year"
                ? YEAR_FORMAT
                : DATE_FORMAT;
        const valid =
          isEmptyValue(value) ||
          (field.type === "amount" || formatHint === "money"
            ? isMoneyString(value, {
                precision: field.type === "amount" ? field.props?.precision : undefined,
                min: field.type === "amount" ? field.props?.min : undefined,
                max: field.type === "amount" ? field.props?.max : undefined,
                allowNegative: field.type === "amount" ? field.props?.allowNegative : undefined,
              })
            : formatHint === "decimal"
              ? isDecimalString(value)
              : field.type === "dateRange"
                ? isValidDateRange(value, calendarFormat)
                : typeof value === "string" && !!parseDate(value, calendarFormat));
        callback(valid ? undefined : new Error(`${label}格式不正确`));
      },
    });
  return [
    ...form.rules,
    ...semantic,
    ...(form.required && field.type !== "rich" ? [VALIDATORS.required(`请填写${label}`)] : []),
  ];
}

function firstValidationMessage(cause: unknown): string | undefined {
  if (!cause || typeof cause !== "object") return;
  const errors: unknown = Reflect.get(cause, "errors");
  if (!Array.isArray(errors)) return;
  const first: unknown = errors[0];
  if (!first || typeof first !== "object") return;
  const message: unknown = Reflect.get(first, "message");
  return typeof message === "string" ? message : undefined;
}

/** 与 Element Plus 使用同一校验器，支持尚未挂载的明细行。 */
export async function validateFieldModel<M, C>(
  fields: readonly FieldDefinition<M, C>[],
  env: FieldEnvironment<M, C>,
  batch = createReferenceValidationBatch()
): Promise<FieldValidationResult<M>> {
  const checks = normalizeFields(fields, env).filter((entry) => entry.form?.visible);
  const errors = (
    await Promise.all(
      checks.map(async ({ field, form }) => {
        const rules = createFieldRules(field, form ?? { required: false, rules: [] });
        const reference =
          field.type === "reference"
            ? Promise.resolve()
                .then(() => field.reference.validate(env.model[field.key], env, batch))
                .catch(() => ({ allowed: false, reason: "参照校验失败，请重试" }))
            : Promise.resolve({ allowed: true, reason: undefined });
        let message = "";
        if (rules.length) {
          // trigger 是 Element Plus 的事件元数据；与其 FormItem 一样在调用校验器前剔除。
          const validationRules = rules.map(({ trigger: _trigger, ...rule }) => rule);
          try {
            await new Schema({ [field.key]: validationRules }).validate(env.model);
          } catch (cause) {
            message = firstValidationMessage(cause) ?? `${field.label}校验失败`;
          }
        }
        try {
          const result = await reference;
          if (!result.allowed) message ||= result.reason ?? "参照校验失败";
        } catch {
          message ||= "参照校验失败，请重试";
        }
        return message ? { field: field.key, message } : undefined;
      })
    )
  ).filter((error) => error !== undefined);
  return { valid: errors.length === 0, errors };
}

/** 一次 validate 调用独享；微任务合并同 source/条件，结束即释放，无跨表单缓存。 */
export function createReferenceValidationBatch(signal?: AbortSignal): ReferenceValidationBatch {
  const owners = new WeakMap<
    object,
    Map<
      string,
      {
        /**
         * 同一数据源/范围本轮待合并的 ID 集合；用于单轮请求去重，不是长期缓存。
         */
        ids: Set<string | number>;
        /**
         * 共享中的异步解析结果；同一轮消费者等待它，失败不能缓存为成功。
         */
        promise: Promise<unknown>;
        /**
         * 当前批次是否仍在收集 ID；封批后新请求进入后续批次。
         */
        collecting: boolean;
      }
    >
  >();
  return {
    signal,
    run<T>(
      owner: object,
      key: string,
      ids: readonly (string | number)[],
      resolve: (ids: readonly (string | number)[]) => Promise<T>
    ): Promise<T> {
      let groups = owners.get(owner);
      if (!groups) {
        groups = new Map();
        owners.set(owner, groups);
      }
      let group = groups.get(key);
      if (!group || !group.collecting) {
        const collected = new Set(ids);
        const entry = {
          ids: collected,
          promise: Promise.resolve<unknown>(undefined),
          collecting: true,
        };
        entry.promise = Promise.resolve().then(() => {
          entry.collecting = false;
          return resolve([...collected]);
        });
        group = entry;
        groups.set(key, group);
      } else ids.forEach((id) => group!.ids.add(id));
      // owner+key 的生产者在 reference 工厂中固定为同一 source.resolve。
      return group.promise as Promise<T>;
    },
  };
}
