<template>
  <el-form
    ref="formRef"
    class="my-form"
    :class="`my-form--${density ?? 'compact'}`"
    :model="state.model.value"
    label-position="top"
    :show-message="false"
    :validate-on-rule-change="false"
    @submit.prevent
  >
    <div ref="gridRef">
      <slot :field="field">
        <div class="my-form-grid" :style="{ '--form-columns': columns ?? 2 }">
          <template v-for="(entry, index) in visibleFields" :key="entry.field.key">
            <h3
              v-if="entry.form.group && entry.form.group !== visibleFields[index - 1]?.form.group"
              class="my-form-group"
            >
              {{ entry.form.group }}
            </h3>
            <MyFormField v-bind="field(entry.field.key)">
              <template v-if="slots[fieldSlotName(entry.field.key)]" #default="cell">
                <slot
                  :name="fieldSlotName(entry.field.key)"
                  :value="cell.value"
                  :set-value="cell.update"
                  :commit="cell.commit"
                  :field="entry.field"
                  :readonly="cell.readonly"
                  :error="cell.error"
                />
              </template>
            </MyFormField>
          </template>
        </div>
      </slot>
    </div>
    <slot name="footer" />
  </el-form>
</template>

<script setup lang="ts" generic="M extends object, C = undefined">
import type { DeepReadonly } from "vue";
import type { FormInstance } from "element-plus";
import { focusFieldControl } from "@/utils/dom";
import MyFormField from "./MyFormField.vue";
import { normalizeFields } from "@/components/business/fields/normalize";
import { sameModelValue } from "@/components/business/fields/model";
import { validateFieldModel } from "@/components/business/fields/validation";
import type {
  FormFieldBinding,
  ChangeReason,
  FieldDefinition,
  FieldKey,
  FieldLink,
  FormPatch,
  FormChange,
  FieldValidationResult,
  MyFormExpose,
  FieldDensity,
} from "@/components/business/fields/types";
import { useFormModel } from "./useFormModel";
import { useFieldDictionaries } from "@/composables/useFieldDictionaries";
const props = defineProps<{
  /**
   * 受控表单模型，接受普通对象或控制器只读模型；组件不修改输入，通过事件回传更新结果。
   * @example `<MyForm v-model="form" ... />`
   */
  modelValue: M | DeepReadonly<M>;
  /** 用户确认后通知；文本 change、参照回填及同步 links 完成后触发。省略不追踪快照。
   * @example
   * <MyForm :change="onFieldChange" />
   */ change?: (event: FormChange<M>) => void;
  /**
   * 字段定义，包含渲染、校验、联动和展示规则。
   * @example `<MyForm :fields="config.fields" ... />`
   */
  fields: readonly FieldDefinition<M, C>[];
  /**
   * 字段渲染、联动与选项加载所需的页面上下文。
   * @example `<MyForm :context="pageContext" ... />`
   */
  context: C;
  /**
   * 返回新增/重置时使用的完整初始模型。
   * @example `<MyForm :create-initial-model="createInitialModel" ... />`
   */
  createInitialModel: () => M;
  /**
   * 表单工作模式，默认 add。
   * @example `<MyForm mode="edit" ... />`
   */
  mode?: "add" | "edit";
  /**
   * 字段间联动规则。
   * @example `<MyForm :links="customerLinks" ... />`
   */
  links?: readonly FieldLink<M, C>[];
  /**
   * 只读展示，保留字段值但不允许编辑。
   * @example `<MyForm readonly ... />`
   */
  readonly?: boolean;
  /**
   * 禁用全部字段交互。
   * @example `<MyForm :disabled="submitting" ... />`
   */
  disabled?: boolean;
  /**
   * 宿主正在加载或保存时禁用重复交互。
   * @example `<MyForm :loading="controller.busy" ... />`
   */
  loading?: boolean;
  /** 表单 DOM 身份；变更时重建校验状态。 */
  formKey?: string | number;
  /** 大屏表单列数，默认由布局自行决定。 */
  columns?: 1 | 2 | 3;
  /** 表单字段的显示密度。 */
  density?: FieldDensity;
}>();
const emit = defineEmits<{
  /**
   * 表单模型变更（v-model），始终为完整模型；未变分支可复用上次发布引用，非独立历史快照。
   * @example `<MyForm v-model="form" />`
   */
  "update:modelValue": [model: M];
  /**
   * 本次变更的最小字段补丁；CRUD 宿主用 changes 回写，避免替换未修改的子表。
   * @example `<MyForm @patch="({ changes }) => controller.patch(changes)" />`
   */
  patch: [patch: FormPatch<M>];
}>();
const slots = defineSlots<
  {
    [K in FieldKey<M> as `field-${K}`]?: (props: {
      value: M[K];
      setValue: (value: M[K]) => void;
      /** 确认本字段交互；自定义输入绑定原生 change，快捷按钮在 setValue 后调用。 */ commit: () => void;
      field: FieldDefinition<M, C>;
      readonly: boolean;
      error?: string;
    }) => unknown;
  } & {
    /** 自定义全部主字段布局，省略时按配置生成网格。 */ default?: (layout: {
      /** 获取指定字段绑定，重复挂载会报错。 */ field: <K extends FieldKey<M>>(
        key: K
      ) => FormFieldBinding<M, C, M[K]>;
    }) => unknown;
    /** 表单底部附加内容。 */ footer?: () => unknown;
  }
>();
useFieldDictionaries(
  () => props.fields,
  () => props.context
);
const state = useFormModel(
  props,
  (model, patch) => {
    emit("update:modelValue", model);
    emit("patch", patch);
  },
  { enabled: () => !!props.change, emit: (event) => props.change?.(event) }
);
const formRef = ref<FormInstance>();
const gridRef = ref<HTMLElement>();
const errors = shallowRef<Record<string, string>>({});
let validationVersion = 0;
const normalized = computed(() =>
  normalizeFields(
    props.fields,
    state.env.value,
    !!(props.readonly || props.disabled || props.loading)
  )
);
const entriesByKey = computed(
  () => new Map(normalized.value.map((entry) => [entry.field.key, entry]))
);
const visibleFields = computed(() =>
  normalized.value.filter(
    (entry): entry is typeof entry & { form: NonNullable<typeof entry.form> } =>
      !!entry.form?.visible
  )
);
const mountedFields = new Set<FieldKey<M>>();
function field<K extends FieldKey<M>>(key: K): FormFieldBinding<M, C, M[K]> {
  const entry = entriesByKey.value.get(key);
  if (!entry) throw new Error("未配置表单字段：" + key);
  return {
    field: entry.field,
    env: state.env.value,
    value: state.model.value[key],
    visible: !!entry.form?.visible,
    readonly: !!entry.form?.readonly,
    error: errors.value[key],
    entityVersion: state.entityVersion.value,
    update: (value, mapped = {}, reason = "user") => change(entry.field, value, mapped, reason),
    commit: () => state.commit(key),
    register: () => {
      if (mountedFields.has(key)) throw new Error("字段重复挂载：" + key);
      mountedFields.add(key);
      return () => {
        mountedFields.delete(key);
      };
    },
  };
}
function change(
  field: FieldDefinition<M, C>,
  value: M[FieldKey<M>],
  mapped: Partial<M>,
  reason: ChangeReason
) {
  const entry = entriesByKey.value.get(field.key);
  if (!entry?.form?.visible || (entry.form.readonly && reason !== "dependency")) return;
  if (Object.hasOwn(mapped, field.key) && !sameModelValue(mapped[field.key], value))
    throw new Error(`参照回填与选择值冲突：${field.key}`);
  const patch = { ...mapped, [field.key]: value } as Partial<M>;
  state.applyPatch(patch, reason, field.key);
}
function clearValidate(keys?: readonly FieldKey<M>[]) {
  validationVersion++;
  if (!keys) errors.value = {};
  else {
    const next = { ...errors.value };
    keys.forEach((key) => delete next[key]);
    errors.value = next;
  }
  formRef.value?.clearValidate(keys ? [...keys] : undefined);
}
watch([state.version, () => props.mode, () => props.fields], () => clearValidate(), {
  flush: "sync",
  deep: true,
});
async function validateFields(keys: readonly FieldKey<M>[]): Promise<FieldValidationResult<M>> {
  const run = ++validationVersion;
  const modelVersion = state.version.value;
  const active = visibleFields.value.filter((entry) => keys.includes(entry.field.key));
  // 与子表复用同一校验器，未挂载的必填字段也不能绕过校验。
  const result = await validateFieldModel(
    active.map((entry) => entry.field),
    state.env.value
  );
  if (run !== validationVersion || modelVersion !== state.version.value)
    return { valid: false, stale: true, errors: [] };
  const next = { ...errors.value };
  active.forEach((entry) => delete next[entry.field.key]);
  result.errors.forEach((error) => {
    next[error.field] = error.message;
  });
  errors.value = next;
  result.valid = result.errors.length === 0;
  return result;
}
function focusField(key: FieldKey<M>) {
  const wrapper = Array.from(
    gridRef.value?.querySelectorAll<HTMLElement>("[data-field]") ?? []
  ).find((element) => element.dataset.field === key);
  focusFieldControl(wrapper);
}
defineExpose<MyFormExpose<M>>({
  hydrate: (model) => {
    state.hydrate(model);
    clearValidate();
  },
  reset: () => {
    state.reset();
    clearValidate();
  },
  applyPatch: state.applyPatch,
  validate: () => validateFields(visibleFields.value.map((entry) => entry.field.key)),
  validateFields,
  clearValidate,
  focusField,
});
function fieldSlotName(key: string) {
  return `field-${key}` as Exclude<keyof typeof slots, "footer" | "default">;
}
</script>

<style scoped lang="scss">
.my-form--compact :deep(.el-form-item) {
  margin-bottom: 16px;
}
.my-form--comfortable :deep(.el-form-item) {
  margin-bottom: 24px;
}
.my-form {
  /* 以表单宿主实际可用宽度断点；抽屉和窄弹窗不依赖浏览器视口宽度。 */
  container-type: inline-size;
}
.my-form :deep(.el-form-item__label) {
  display: inline-flex;
  align-items: center;
  line-height: 22px;
  height: auto;
  margin-bottom: 6px;
}
.my-form-grid {
  display: grid;
  grid-template-columns: repeat(var(--form-columns), minmax(0, 1fr));
  gap: 0 var(--page-gap, 16px);
  :deep(.el-form-item) {
    grid-column: span min(var(--field-span), var(--form-columns));
    min-width: 0;
  }
  :deep(.el-form-item__content > *) {
    max-width: 100%;
  }
  :deep(.el-input-number),
  :deep(.el-date-editor) {
    width: 100%;
  }
}
.my-form-group {
  grid-column: 1 / -1;
  margin: 4px 0 16px;
  padding: 0 0 8px 10px;
  border-left: 3px solid var(--el-color-primary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 15px;
}
@container (max-width: 640px) {
  .my-form-grid {
    grid-template-columns: minmax(0, 1fr);
    :deep(.el-form-item) {
      grid-column: span 1;
    }
  }
}
</style>
