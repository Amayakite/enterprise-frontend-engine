<template>
  <!-- 按 field.type 显示一个输入控件，从 env.model[field.key] 取值；监听 change 回写。需要标签和校验时使用 MyForm。 -->
  <div class="field-input"><component :is="renderInput" /></div>
</template>

<script setup lang="ts" generic="M extends object, C">
import { h, type Component } from "vue";
// 由已配置的 Element Plus resolver 导入组件及样式；显式只导入组件会漏掉 h 渲染控件的样式。
import DictSelect from "@/components/business/DictSelect.vue";
import SingleImageUpload from "@/components/common/Upload/SingleImageUpload.vue";
import MultiImageUpload from "@/components/common/Upload/MultiImageUpload.vue";
import FileUpload from "@/components/common/Upload/FileUpload.vue";
import RichTextInput from "./RichTextInput.vue";
import FieldDisplay from "./FieldDisplay.vue";
import RegionCascader from "./RegionCascader.vue";
import { sameModelValue } from "./model";
import { fieldPlaceholder } from "./presentation";
import type { ChangeReason, FieldDefinition, FieldEnvironment, FieldKey } from "./types";
import type { FileInfo } from "@/api/file/types";

/** 检查值是否为图片 URL 字符串数组，避免把错误形状传给上传组件。 */
function isImageList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}
/** 检查附件列表至少具备 name/url 字符串，供上传组件安全读取。 */
function isFileList(value: unknown): value is FileInfo[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        typeof item.name === "string" &&
        "url" in item &&
        typeof item.url === "string"
    )
  );
}

const props = defineProps<{
  /**
   * 选择要显示的输入控件。普通文本至少传 key、label、type；选择框还需 options。
   * 此组件不自动执行 form 中的校验和联动，完整表单请使用 MyForm。
   * @example
   * `<FieldInput :field="nameField" ... />`
   */
  field: FieldDefinition<M, C>;
  /**
   * model 提供字段当前值；context 提供组织等额外信息，不需要时传 undefined；mode 为 add 或 edit。
   * @example
   * `<FieldInput :env="{ model: form, context: undefined, mode: 'edit' }" ... />`
   */
  env: FieldEnvironment<M, C>;
  /**
   * 是否只读；只读时改用字段展示组件。
   * @example
   * `<FieldInput :readonly="detailMode" ... />`
   */
  readonly: boolean;
}>();
const emit = defineEmits<{
  /** 输入值变化时触发。value 是新值，mapped 是需要一起回填的其他字段，reason 说明变化来源；由页面更新模型。
   * @example
   * <FieldInput @change="applyFieldChange" />
   */ change: [value: M[FieldKey<M>], mapped: Partial<M>, reason: ChangeReason];
  /** 确认本次交互；文本在 change/失焦时，选择类在值及回填发出后触发。
   * @example
   * <FieldInput @commit="commitField" />
   */ commit: [];
}>();
// 根模型不可变更新会复制数组；等值字段保留输入引用，避免上传控件重置进行中的文件。
const inputValue = computed<M[FieldKey<M>]>((previous) => {
  const next = props.env.model[props.field.key];
  return previous !== undefined && sameModelValue(previous, next) ? previous : next;
});
/** 把控件的新值通知外层字段；选择类立即确认，文本/数字等待完成输入再确认。 */
function update(value: unknown) {
  if (props.readonly) return;
  // field 的判别联合约束模型值；各原生控件在此统一 clear 为约定空值。
  emit("change", value as M[FieldKey<M>], {}, "user");
  if (!["text", "textarea", "amount", "number", "rich"].includes(props.field.type)) emit("commit");
}
/** 按字段类型选择实际输入组件，统一传入当前值、提示和回写事件；只读时改为显示组件。 */
function renderInput() {
  const { field, env, readonly } = props;
  const value = inputValue.value;
  const placeholder = fieldPlaceholder(field);
  if (field.type === "reference")
    return field.reference.render(
      value,
      env,
      readonly,
      (next, mapped, reason) => {
        if (!readonly || reason === "dependency") {
          if (Object.hasOwn(mapped, field.key) && !sameModelValue(mapped[field.key], next))
            throw new Error(`参照回写不能覆盖主 ID：${field.key}`);
          emit("change", next, mapped, reason);
          emit("commit");
        }
      },
      { placeholder }
    );
  if (readonly) return h(FieldDisplay as Component, { field, env });
  switch (field.type) {
    case "text":
    case "textarea":
      return h(ElInput, {
        ...field.props,
        placeholder,
        ariaLabel: field.label,
        // 固定初始行数并允许原生纵向拉伸，避免异步 autosize 测量已卸载的输入。
        rows: field.type === "textarea" ? (field.props?.rows ?? 2) : undefined,
        resize: field.type === "textarea" ? "vertical" : undefined,
        modelValue: typeof value === "string" ? value : "",
        type: field.type === "textarea" ? "textarea" : "text",
        "onUpdate:modelValue": update,
        onChange: () => emit("commit"),
      });
    case "number":
      return h(ElInputNumber, {
        ...field.props,
        placeholder,
        ariaLabel: field.label,
        modelValue: typeof value === "number" ? value : undefined,
        "onUpdate:modelValue": (next: number | undefined) =>
          update(next ?? (field.emptyValue === undefined ? 0 : field.emptyValue)),
        onChange: () => emit("commit"),
      });
    case "date":
    case "datetime":
    case "month":
    case "year":
    case "dateRange":
      return h(ElDatePicker, {
        ...field.props,
        placeholder,
        ariaLabel: field.label,
        modelValue:
          typeof value === "string" || Array.isArray(value) ? (value as string | string[]) : null,
        type: field.type === "dateRange" ? "daterange" : field.type,
        valueFormat:
          field.type === "datetime"
            ? "YYYY-MM-DD HH:mm:ss"
            : field.type === "month"
              ? "YYYY-MM"
              : field.type === "year"
                ? "YYYY"
                : "YYYY-MM-DD",
        "onUpdate:modelValue": (next: unknown) =>
          update(
            next ??
              (field.type === "dateRange"
                ? (field.emptyValue ?? [])
                : field.emptyValue === undefined
                  ? ""
                  : field.emptyValue)
          ),
      });
    case "amount":
      return h(ElInput, {
        ...field.props,
        placeholder: placeholder ?? "0.00",
        ariaLabel: field.label,
        inputmode: "decimal",
        onChange: () => emit("commit"),
        modelValue: typeof value === "string" ? value : "",
        "onUpdate:modelValue": update,
      });
    case "region":
      return h(RegionCascader, {
        modelValue: value as import("./types").RegionId | null,
        source: field.region.source,
        filters: field.region.filters(env),
        readonly,
        placeholder,
        onChange: (
          next: import("./types").RegionId | null,
          items: readonly import("./types").RegionOption[]
        ) => updateRegion(next, field.region.map(items)),
      });
    case "switch":
      return h(ElSwitch, {
        ...field.props,
        modelValue: value === true,
        "onUpdate:modelValue": update,
      });
    case "dict":
      return h(DictSelect, {
        placeholder,
        "aria-label": field.label,
        code: typeof field.dict.code === "function" ? field.dict.code(env) : field.dict.code,
        type: field.dict.type,
        modelValue: value as string | number | null | (string | number)[],
        style: { width: "100%" },
        "onUpdate:modelValue": (next: unknown) => {
          if (next === undefined || next === null || next === "") return update(field.emptyValue);
          const decode = (item: unknown) =>
            field.dict.valueType === "number"
              ? Number(item)
              : field.dict.valueType === "string"
                ? String(item)
                : item;
          const decoded = Array.isArray(next) ? next.map(decode) : decode(next);
          if (
            (Array.isArray(decoded) ? decoded : [decoded]).some(
              (item) => typeof item === "number" && !Number.isFinite(item)
            )
          )
            return update(field.emptyValue);
          update(decoded);
        },
      });
    case "select":
      return h(
        ElSelect,
        {
          ...field.props,
          placeholder: placeholder ?? "请选择",
          ariaLabel: field.label,
          clearable: field.emptyValue !== undefined && field.props?.clearable !== false,
          valueOnClear: () => field.emptyValue ?? null,
          modelValue: typeof value === "string" || typeof value === "number" ? value : null,
          "onUpdate:modelValue": (next: unknown) =>
            update(next === undefined ? field.emptyValue : next),
        },
        () =>
          field.options.map((option) =>
            h(ElOption, { ...option, key: `${typeof option.value}:${option.value}` })
          )
      );
    case "image":
      return h(SingleImageUpload, {
        modelValue: typeof value === "string" ? value : "",
        "onUpdate:modelValue": update,
      });
    case "images":
      return h(MultiImageUpload, {
        modelValue: isImageList(value) ? value : [],
        "onUpdate:modelValue": update,
      });
    case "files":
      return h(FileUpload, {
        modelValue: isFileList(value) ? value : [],
        "onUpdate:modelValue": update,
      });
    case "rich":
      return h(RichTextInput, {
        onFocusout: () => emit("commit"),
        modelValue: typeof value === "string" ? value : "",
        height: field.props?.height,
        maxlength: field.props?.maxlength,
        placeholder,
        "onUpdate:modelValue": update,
      });
    case "custom":
      return h("span", "请提供字段插槽");
  }
}

/** 地区选择同时回写末级 ID 和省市区等关联字段，再通知本次选择已完成。 */
function updateRegion(value: unknown, mapped: Partial<M>) {
  if (props.readonly) return;
  emit("change", value as M[FieldKey<M>], mapped, "user");
  emit("commit");
}
</script>

<style scoped lang="scss">
.field-input {
  width: 100%;
  min-width: 0;
  line-height: 24px;
}
.field-input :deep(.el-select),
.field-input :deep(.el-input-number),
.field-input :deep(.el-date-editor) {
  width: 100%;
  min-width: 0;
}
</style>
