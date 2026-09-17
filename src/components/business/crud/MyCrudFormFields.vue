<template>
  <MyForm
    ref="form"
    :model-value="model"
    :change="change"
    :fields="fields"
    :context="context"
    :create-initial-model="() => model"
    :mode="target.mode"
    :readonly="blocked"
    :form-key="hydrationKey"
    :links="links"
    :columns="columns"
    :density="density"
    @update:model-value="controller.patch"
  >
    <template v-if="$slots.default" #default="layout"><slot v-bind="layout" /></template>
    <template
      v-for="field in fields.filter((item) => slots[fieldSlot(item.key)])"
      :key="field.key"
      #[`field-${field.key}`]="cell"
    >
      <slot
        :name="fieldSlot(field.key)"
        :model="controller.state.model"
        :value="cell.value"
        :readonly="cell.readonly"
        :update="cell.setValue"
        :commit="cell.commit"
      />
    </template>
  </MyForm>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number, C">
import { computed, ref, onBeforeUnmount } from "vue";
import MyForm from "../MyForm/index.vue";
import { cloneReadonlyModel } from "../fields/model";
import type { MyFormExpose, FieldKey, FormFieldBinding } from "../fields/types";
import type { CrudFormSlots, CrudTarget } from "./types";
import { crudFormDisabledReason } from "./form-presentation";
import type { CrudFormProps } from "./form-presentation";
defineOptions({ inheritAttrs: false });
const props =
  defineProps<
    Omit<
      CrudFormProps<Model, Entity, Id, C>,
      "sections" | "changePending" | "changeError" | "retryChange"
    >
  >();
const slots = defineSlots<
  CrudFormSlots<Model, Entity, Id> & {
    /** 自定义主字段布局；field 只能选择模型字段，同一字段只挂载一次。 */
    default?: (layout: {
      /** 获取原表单内字段的类型安全绑定。 */ field: <K extends FieldKey<Model>>(
        key: K
      ) => FormFieldBinding<Model, C, Model[K]>;
    }) => unknown;
  }
>();
const form = ref<MyFormExpose<Model>>();
// 实体 ID 相同也可能重新读取或恢复草稿；整批回填必须与运行期 patch 分开。
const hydrationKey = computed(() =>
  JSON.stringify([props.entityKey, props.controller.state.hydrationRevision])
);
const model = computed(() => cloneReadonlyModel<Model>(props.controller.state.model));
const target = computed(() => cloneReadonlyModel<CrudTarget<Id>>(props.controller.state.target));
const blocked = computed(() => !!crudFormDisabledReason(props.controller, props.readonlyReason));
const fieldSlot = (key: FieldKey<Model>) =>
  `field-${key}` as Exclude<keyof typeof slots, "footer" | "header" | "default">;
const unregister = props.controller.registerForm({
  async validate() {
    if (!form.value) return { valid: false, issues: [{ message: "表单尚未就绪" }] };
    const result = await form.value.validate();
    return result.valid
      ? { valid: true }
      : {
          valid: false,
          issues: result.errors.length ? result.errors : [{ message: "表单校验已过期，请重试" }],
        };
  },
  clear() {
    form.value?.clearValidate();
  },
  focus(issue) {
    if (issue.field) form.value?.focusField(issue.field);
  },
});

onBeforeUnmount(unregister);
</script>
