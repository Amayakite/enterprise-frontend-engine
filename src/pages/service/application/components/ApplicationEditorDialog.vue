<template>
  <MyDialog
    v-model="visible"
    :title="id ? '编辑服务申请' : '新增服务申请'"
    width="min(980px, 95vw)"
    destroy-on-close
    @closed="resetDialog"
  >
    <MyForm
      ref="formRef"
      v-model="form"
      :fields="serviceApplicationFields"
      :links="serviceApplicationLinks"
      :context="context"
      :create-initial-model="createInitialServiceApplicationForm"
      :mode="id ? 'edit' : 'add'"
      :form-key="formKey"
      :loading="loading"
      :columns="3"
    />
    <el-alert
      class="mock-tip"
      type="info"
      :closable="false"
      title="服务项目会回填计算基准和定价；备注填写“保存失败”可验证失败分支。"
    />
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
        <el-button :disabled="submitting" @click="visible = false">取消</el-button>
      </div>
    </template>
  </MyDialog>
</template>

<script setup lang="ts">
import MyForm from "@/components/business/MyForm/index.vue";
import ServiceApplicationAPI from "@/api/service/application";
import type { MyFormExpose } from "@/components/business/fields/types";
import {
  createInitialServiceApplicationForm,
  toServiceApplicationForm,
  toServiceApplicationPayload,
} from "../adapters";
import { serviceApplicationFields, serviceApplicationLinks } from "../fields";
import type { ServiceApplicationFormModel, ServiceApplicationPageContext } from "../types";

const props = defineProps<{ id: string | null; context: ServiceApplicationPageContext }>();
const emit = defineEmits<{ saved: [] }>();
const visible = defineModel<boolean>({ required: true });
const formRef = ref<MyFormExpose<ServiceApplicationFormModel>>();
const form = ref(createInitialServiceApplicationForm());
const loading = ref(false);
const submitting = ref(false);
const revision = ref(0);
const formKey = computed(() => props.id ?? `new-${revision.value}`);

watch(
  () => [visible.value, props.id] as const,
  async ([open, id]) => {
    if (!open) return;
    revision.value++;
    loading.value = true;
    try {
      form.value = id
        ? toServiceApplicationForm(await ServiceApplicationAPI.getDetail(id))
        : createInitialServiceApplicationForm();
    } finally {
      loading.value = false;
    }
  }
);

async function submit() {
  const checked = await formRef.value?.validate();
  if (!checked?.valid) return;
  submitting.value = true;
  try {
    const payload = toServiceApplicationPayload(form.value);
    if (props.id)
      await ServiceApplicationAPI.update(props.id, { ...payload, version: form.value.version });
    else await ServiceApplicationAPI.create(payload);
    ElMessage.success("服务申请保存成功");
    visible.value = false;
    emit("saved");
  } finally {
    submitting.value = false;
  }
}

function resetDialog() {
  form.value = createInitialServiceApplicationForm();
  formRef.value?.clearValidate();
}
</script>

<style scoped lang="scss">
.mock-tip {
  margin-top: 16px;
}
</style>
