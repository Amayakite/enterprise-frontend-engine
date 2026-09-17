<template>
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
const presentation = computed(
  () => normalizeFields([props.field], props.env, props.readonly)[0]!.form!
);
const rules = computed(() => createFieldRules(props.field, presentation.value));
const unregister = props.register();
onBeforeUnmount(unregister);
function input(value: M[FieldKey<M>], mapped: Partial<M>, reason: ChangeReason) {
  // FieldInput 的泛型是全模型；此处只呈现绑定 key 的控件，将同一个字段值收窄为绑定值类型。
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
