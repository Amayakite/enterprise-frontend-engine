<template>
  <div class="page-toolbar">
    <div class="page-toolbar__left">
      <strong>{{ controller.state.target.mode === "add" ? "新增" : "编辑" }}</strong>
      <el-tag v-if="controller.state.phase === 'committed-needs-sync'" type="warning" size="small">
        已提交，待回填
      </el-tag>
      <el-tag v-else-if="controller.state.mutationOutcome === 'unknown'" type="danger" size="small">
        提交结果待核实
      </el-tag>
      <el-tag v-else-if="controller.state.dirty" type="warning" size="small">未保存</el-tag>
      <el-tag v-else-if="controller.state.phase === 'saved'" type="success" size="small">
        已保存
      </el-tag>
    </div>
    <div class="page-toolbar__right">
      <slot name="actions" />
      <ActionButton
        v-if="permitted"
        label="保存"
        tone="primary"
        :link="false"
        :disabled="blocked || changePending || !!changeError"
        :disabled-reason="changeError || (changePending ? '字段变化处理中' : readonlyReason)"
        :loading="busy"
        @click="controller.save"
      />
      <el-button :disabled="busy" @click="controller.close">关闭</el-button>
    </div>
  </div>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number">
import { computed } from "vue";
import ActionButton from "../ActionButton.vue";
import { crudFormDisabledReason } from "./form-presentation";
import type { CrudFormProps } from "./form-presentation";
defineOptions({ inheritAttrs: false });
const props =
  defineProps<
    Pick<
      CrudFormProps<Model, Entity, Id, unknown>,
      "controller" | "readonlyReason" | "changePending" | "changeError"
    >
  >();
defineSlots<{ /** 保存按钮前追加业务操作；不替换内置保存保护。 */ actions?: () => unknown }>();
const busy = computed(() => props.controller.busy);
const permitted = computed(() => props.controller.savePermission);
const readonlyReason = computed(() =>
  crudFormDisabledReason(props.controller, props.readonlyReason)
);
const blocked = computed(() => !!readonlyReason.value);
</script>
