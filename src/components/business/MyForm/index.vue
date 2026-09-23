<template>
  <!-- 根据 fields 显示输入项，通过 v-model 更新表单数据。传入初始值和 context 后可使用校验、联动；保存 API 由页面调用。 -->
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
      <!-- 默认自动排版；替换 default 插槽时复用 field(key)，保留同一套校验和字段状态。 -->
      <slot :field="field">
        <div class="my-form-grid" :style="{ '--form-columns': columns ?? 2 }">
          <template v-for="(entry, index) in visibleFields" :key="entry.field.key">
            <h2
              v-if="entry.form.group && entry.form.group !== visibleFields[index - 1]?.form.group"
              class="my-form-group"
            >
              {{ entry.form.group }}
            </h2>
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
    <!-- footer 用于放确认等按钮。页面先调用 validate 检查填写内容，再决定是否保存。 -->
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
  FormVisibleGroup,
} from "@/components/business/fields/types";
import { useFormModel } from "./useFormModel";
import { useFieldDictionaries } from "@/composables/useFieldDictionaries";
const props = defineProps<{
  /**
   * 受控表单模型，接受普通对象或控制器只读模型；组件不修改输入，通过事件回传更新结果。
   * @example `<MyForm v-model="form" ... />`
   */
  modelValue: M | DeepReadonly<M>;
  /**
   * 调用方保证根对象替换、未变分支引用稳定时设为 true，关闭深监听；默认 false 兼容原位修改。
   * 挂载后不切换策略；本组件仍不修改输入，CRUD 适配器自动启用。
   * @example
   * <MyForm :immutable-model="true" :model-value="model" />
   */
  immutableModel?: boolean;
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
   * 调用方正在加载或保存时禁用重复交互。
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
   * 本次变更的最小字段补丁；CRUD 调用方用 changes 回写，避免替换未修改的子表。
   * @example `<MyForm @patch="({ changes }) => controller.patch(changes)" />`
   */
  patch: [patch: FormPatch<M>];
  /** 当前可见分组变化时通知调用方；只传字段键和标题，首次挂载也触发，不修改模型。
   * @example
   * <MyForm @groups-change="groups = $event" />
   */
  "groups-change": [groups: readonly FormVisibleGroup<M>[]];
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
/** 维护当前填写内容、初始数据和同步联动；统一发布 v-model、patch 以及可选的 change 事件。 */
const state = useFormModel(
  props,
  (model, patch) => {
    emit("update:modelValue", model);
    emit("patch", patch);
  },
  { enabled: () => !!props.change, emit: (event) => props.change?.(event) }
);
/** Element Plus 表单实例，仅用于同步清除它内部保存的校验提示。 */
const formRef = ref<FormInstance>();
/** 字段所在容器，错误定位时从这里查找目标输入框。 */
const gridRef = ref<HTMLElement>();
/** 按字段名保存公共校验器返回的错误，供默认及自定义布局一致显示。 */
const errors = shallowRef<Record<string, string>>({});
/** 每次开始或取消校验时递增，防止较慢的旧校验覆盖新输入的结果。 */
let validationVersion = 0;
/** 结合当前模型和页面只读状态，计算每个字段的可见、只读、必填及布局配置。 */
const normalized = computed(() =>
  normalizeFields(
    props.fields,
    state.env.value,
    !!(props.readonly || props.disabled || props.loading)
  )
);
/** 按字段名建立索引，field(key) 和回写时无需反复扫描整个字段数组。 */
const entriesByKey = computed(
  () => new Map(normalized.value.map((entry) => [entry.field.key, entry]))
);
/** 只保留当前允许显示的表单字段，默认布局和整表校验共用这份结果。 */
const visibleFields = computed(() =>
  normalized.value.filter(
    (entry): entry is typeof entry & { form: NonNullable<typeof entry.form> } =>
      !!entry.form?.visible
  )
);
/** 字段显隐或分组变化时通知上层更新分区导航；分组内容没变就不重复通知。 */
watch(
  () => {
    const groups: FormVisibleGroup<M>[] = [];
    for (const entry of visibleFields.value) {
      const label = entry.form.group || groups.at(-1)?.label || "基本信息";
      const previous = groups.at(-1);
      if (previous?.label === label) previous.fields = [...previous.fields, entry.field.key];
      else groups.push({ key: entry.field.key, label, fields: [entry.field.key] });
    }
    return groups;
  },
  (groups, previous) => {
    if (!sameModelValue(groups, previous)) emit("groups-change", groups);
  },
  { immediate: true }
);
/** 记录已经显示的字段，防止自定义布局把同一个字段放两次导致回写和校验混乱。 */
const mountedFields = new Set<FieldKey<M>>();
/** 为 MyFormField 生成该字段的值、错误和操作方法，并登记其挂载/卸载。 */
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
/** 检查字段可编辑性和参照回填冲突，再把主值与额外回填一起交给联动处理。 */
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
/** 清除全部或指定字段的错误，同时作废尚未完成的校验，避免错误提示再次出现。 */
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
/** 字段值、模式或配置变化时清除旧错误；用户修改后不继续显示上一次校验结论。 */
watch([state.version, () => props.mode, () => props.fields], () => clearValidate(), {
  flush: "sync",
  deep: true,
});
/** 按指定字段执行校验，结果返回时核对版本；输入已变化则标记过期，不写入错误列表。 */
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
/** 滚动到目标字段并尝试聚焦输入；只读字段没有输入框时也能定位到它的位置。 */
function focusField(key: FieldKey<M>) {
  const wrapper = Array.from(
    gridRef.value?.querySelectorAll<HTMLElement>("[data-field]") ?? []
  ).find((element) => element.dataset.field === key);
  // 只读分区可能没有可聚焦输入，导航仍需让目标字段进入正文可视区域。
  wrapper?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
/** 把字段名转换为 field-*，供页面替换某个字段的输入内容。 */
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
