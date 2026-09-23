<template>
  <!-- 只显示表单字段，适合自己安排按钮和提示的位置。传入 bindings.fields 后，输入仍会更新原表单、校验结果和草稿。 -->
  <MyForm
    ref="form"
    :model-value="model"
    :immutable-model="true"
    :change="change"
    :fields="fields"
    :context="context"
    :create-initial-model="() => cloneReadonlyModel<Model>(model)"
    :mode="target.mode"
    :readonly="blocked"
    :form-key="hydrationKey"
    :links="links"
    :columns="columns"
    :density="density"
    @patch="onPatch"
    @groups-change="emit('groups-change', $event)"
  >
    <!-- 需要手动排字段位置时，在插槽中给 MyFormField 传 field(key)；同一字段只放一次，保留原有回写和校验。 -->
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
import type { FormPatch, FormVisibleGroup } from "../fields/types";
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
/** 主表单实例，用于保存前校验、清除错误和定位具体字段；组件未挂载时为空。 */
const form = ref<MyFormExpose<Model>>();
const emit = defineEmits<{
  /** 透传当前可见主字段分组；供导航显示与错误计数，不包含模型值。 */
  "groups-change": [groups: readonly FormVisibleGroup<Model>[]];
}>();
// 实体 ID 相同也可能重新读取或恢复草稿；整批回填必须与运行期 patch 分开。
const hydrationKey = computed(() =>
  JSON.stringify([props.entityKey, props.controller.state.hydrationRevision])
);
/** 当前主表数据，直接随 controller 更新，避免新增一份不同步的编辑数据。 */
const model = computed(() => props.controller.state.model);
/** 把字段输入和联动生成的修改交给表单保存逻辑，继续记录未保存状态和草稿。 */
function onPatch(patch: FormPatch<Model>) {
  props.controller.patch(patch.changes);
}
/** 当前是新增还是编辑及对应 ID 的只读副本，传给字段表单判断当前模式。 */
const target = computed(() => cloneReadonlyModel<CrudTarget<Id>>(props.controller.state.target));
/** 当前是否禁止编辑；加载、权限、只读或待处理草稿等原因由公共方法统一判断。 */
const blocked = computed(() => !!crudFormDisabledReason(props.controller, props.readonlyReason));
/** 将字段名转为 field-* 插槽名，把页面自定义输入传给内部表单。 */
const fieldSlot = (key: FieldKey<Model>) =>
  `field-${key}` as Exclude<keyof typeof slots, "footer" | "header" | "default">;
/** 把校验、清错和字段定位方法登记到 controller；返回的函数用于卸载时取消登记。 */
const unregister = props.controller.registerForm({
  /** 主表保存前调用；表单尚未挂载或校验结果过期时都不能继续提交。 */
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
  /** 回填或重置后清除原表单中的校验提示。 */
  clear() {
    form.value?.clearValidate();
  },
  /** 用户点击错误清单时，把焦点放到对应主表字段。 */
  focus(issue) {
    if (issue.field) form.value?.focusField(issue.field);
  },
});

/** 离开页面时移除主表单的登记，避免后续保存还调用已销毁的表单。 */
onBeforeUnmount(unregister);
</script>
