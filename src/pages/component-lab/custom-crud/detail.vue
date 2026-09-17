<!-- 定制详情：配置字段与业务摘要自由混排。 -->
<template>
  <div class="page-container">
    <MyCrudLayout>
      <template #toolbar><MyCrudDetailToolbar v-bind="bindings.toolbar" /></template>
      <MyCrudDetailFeedback v-bind="bindings.feedback" />
      <el-alert
        v-if="state.invalidReason"
        :title="state.invalidReason"
        type="error"
        :closable="false"
      />
      <template v-if="state.model">
        <el-card shadow="never">
          <h2>{{ state.model.customerName }}</h2>
          <p>{{ state.model.remark }}</p>
        </el-card>
        <el-card shadow="never">
          <template #header>配置字段</template>
          <MyDesc v-if="bindings.description" v-bind="bindings.description" />
        </el-card>
        <CustomerContacts :rows="state.model.contacts" />
        <CustomerAddresses :rows="state.model.addresses" />
      </template>
      <template #aside>
        <el-statistic title="联系人数量" :value="state.model?.contacts.length ?? 0" />
      </template>
    </MyCrudLayout>
  </div>
</template>
<script setup lang="ts">
import { useRouter } from "vue-router";
import MyCrudLayout from "@/components/business/crud/MyCrudLayout.vue";
import MyCrudDetailToolbar from "@/components/business/crud/MyCrudDetailToolbar.vue";
import MyCrudDetailFeedback from "@/components/business/crud/MyCrudDetailFeedback.vue";
import MyDesc from "@/components/business/MyDesc.vue";
import CustomerContacts from "@/pages/base/customer/children/contacts/CustomerContacts.vue";
import CustomerAddresses from "@/pages/base/customer/children/addresses/CustomerAddresses.vue";
import { useCrudView } from "@/composables/useCrudView";
import { customerModule } from "@/pages/base/customer/config";
const router = useRouter();
const { state, bindings } = useCrudView(customerModule, {
  view: "detail",
  navigation: {
    edit: async (id) => {
      await router.push("/component-lab/custom-crud/edit/" + encodeURIComponent(id));
    },
  },
});
</script>
