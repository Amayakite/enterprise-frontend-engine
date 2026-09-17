<template>
  <MyCrudPage :page="page">
    <template #field-customerName="{ value, update, commit }">
      <span>{{ value.trim() }}</span>
      <button @click="commit()">确认完成</button>
      <button @click="update('新名称')">更新</button>
      <!-- @vue-expect-error 字符串字段不能传数字 -->
      <button @click="update(42)">错误</button>
    </template>
    <template #section-contacts="{ binding, rows }">
      <span>{{ rows[0]?.name }}</span>
      <button @click="binding.replace([])">清空</button>
    </template>
  </MyCrudPage>
  <MyCrudForm v-bind="bindings.form">
    <template #header="{ state }">
      <span>{{ state.model.customerName.trim() }}</span>
      <!-- @vue-expect-error header 的模型仍然只读 -->
      <button @click="state.model.customerName = '不能直接赋值'">错误</button>
    </template>
    <template #field-customerName="{ value, update, commit }">
      <span>{{ value.trim() }}</span>
      <button @click="commit()">确认完成</button>
      <!-- @vue-expect-error 直接表单的字段插槽仍保留字符串类型 -->
      <button @click="update(42)">错误</button>
    </template>
    <template #section-contacts>
      <CustomerContacts :binding="contacts" />
    </template>
  </MyCrudForm>
  <MyCrudFormFields v-bind="bindings.fields">
    <template #default="{ field }">
      <MyFormField v-bind="field('phone')">
        <template #default="{ value, update, commit }">
          <span>{{ value.trim() }}</span>
          <button
            @click="
              update('13800000000');
              commit();
            "
          >
            填写电话
          </button>
          <!-- @vue-expect-error 电话字段只能回写字符串 -->
          <button @click="update(123)">错误</button>
        </template>
      </MyFormField>
      <!-- @vue-expect-error 不存在的字段不可获取绑定 -->
      <MyFormField v-bind="field('missingField')" />
    </template>
  </MyCrudFormFields>
</template>
<script setup lang="ts">
import MyCrudFormFields from "../../src/components/business/crud/MyCrudFormFields.vue";
import MyFormField from "../../src/components/business/MyForm/MyFormField.vue";
import MyCrudForm from "../../src/components/business/crud/MyCrudForm.vue";
import CustomerContacts from "../../src/pages/base/customer/children/contacts/CustomerContacts.vue";
import { useCrudView } from "../../src/composables/useCrudView";
import MyCrudPage from "../../src/components/business/crud/MyCrudPage.vue";
import { useCrudPage } from "../../src/composables/useCrudPage";
import { customerModule } from "../../src/pages/base/customer/config";
const page = useCrudPage(customerModule, { view: "add" });
const { bindings } = useCrudView(customerModule, { view: "add" });
const contacts = bindings.child("contacts");
</script>
