<template>
  <MyForm
    v-model="model"
    :fields="fields"
    :context="context"
    :create-initial-model="createInitialModel"
  >
    <template #field-custom="{ value, setValue }">
      <button @click="setValue({ priority: value.priority + 1, tags: [] })">合法自定义值</button>
      <!-- @vue-expect-error 自定义插槽更新保留字段对象类型 -->
      <button @click="setValue('错误对象')">错误自定义值</button>
    </template>
    <template #field-amount="{ setValue }">
      <!-- @vue-expect-error 数字字段不能更新字符串 -->
      <button @click="setValue('错误金额')">错误输入值</button>
    </template>
  </MyForm>
</template>

<script setup lang="ts">
import MyForm from "@/components/business/MyForm/index.vue";
import { fields } from "./fields";
import { createInitialModel } from "./adapters";
import type { FormLabContext } from "./types";
const model = ref(createInitialModel());
const context: FormLabContext = {
  organizationId: "org-a",
  canEdit: true,
  showAttachments: false,
  dictCode: "gender",
};
</script>
