<template>
  <!-- 显示单个字段的标签、输入框和校验错误。在 MyForm 插槽中用 v-bind="field('字段名')" 传入参数，不需要手动构造它们。 -->
  <el-form-item
    v-if="visible"
    :label="field.label"
    :prop="field.key"
    :required="presentation.required"
    :rules="rules"
    :validate-status="error ? 'error' : 'success'"
    :data-field="field.key"
    :style="{ '--field-span': presentation.span }"
  >
    <template #label>
      <FieldLabel :label="field.label" :help="fieldHelpText(field, env, readonly)" />
    </template>
    <slot :value="value" :update="update" :commit="commit" :readonly="readonly" :error="error">
      <FieldInput
        :key="entityVersion"
        :field="field"
        :env="env"
        :readonly="readonly"
        @change="input"
        @commit="commit"
      />
    </slot>
    <FieldHelp :field="field" :env="env" :readonly="readonly" />
    <div v-if="error" class="my-form-error" role="alert">{{ error }}</div>
  </el-form-item>
</template>
<script setup lang="ts" generic="M extends object, C, Value">
import { computed, onBeforeUnmount } from "vue";
import FieldInput from "../fields/FieldInput.vue";
import FieldHelp from "../fields/FieldHelp.vue";
import FieldLabel from "../fields/FieldLabel.vue";
import { fieldHelpText } from "../fields/presentation";
import { normalizeFields } from "../fields/normalize";
import { createFieldRules } from "../fields/validation";
import type { FormFieldBinding, FieldKey, ChangeReason } from "../fields/types";
const props = defineProps<FormFieldBinding<M, C, Value>>();
defineSlots<{
  /** 替换输入控件；update 回写、commit 确认，readonly 必须传给自定义控件。 */
  default?: (cell: {
    /** 当前字段值。 */ value: Value;
    /** 更新本字段，保留主表联动及草稿。 */ update: FormFieldBinding<M, C, Value>["update"];
    /** 确认本次交互。 */ commit: () => void;
    /** 当前只读状态。 */ readonly: boolean;
    /** 字段错误，省略表示通过。 */ error?: string;
  }) => unknown;
}>();
/** 计算当前字段的必填、跨度和只读等显示规则，随表单值和上下文一起变化。 */
const presentation = computed(
  () => normalizeFields([props.field], props.env, props.readonly)[0]!.form!
);
/** 把字段的格式与表单规则转换为 Element Plus 可以识别的校验规则。 */
const rules = computed(() => createFieldRules(props.field, presentation.value));
/** 登记这个字段已显示，卸载时取消登记，防止同一字段重复出现。 */
const unregister = props.register();
/** 移除当前字段的登记，允许后续布局重新显示它。 */
onBeforeUnmount(unregister);
/** 把通用输入组件返回的值交给本字段的 update，保留参照回填和变化来源。 */
function input(value: M[FieldKey<M>], mapped: Partial<M>, reason: ChangeReason) {
  // FieldInput 的泛型是全模型；此处只显示绑定 key 的控件，将同一个字段值收窄为绑定值类型。
  props.update(value as Value, mapped, reason);
}
</script>
<style scoped>
.my-form-error {
  width: 100%;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 20px;
}
</style>
