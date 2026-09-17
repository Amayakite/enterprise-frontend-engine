<!-- 定制布局示例：复用 customer 配置，不复制字段、接口或子表规则。 -->
<template>
  <div class="page-container">
    <MyCrudLayout>
      <template #toolbar>
        <MyCrudFormToolbar v-bind="bindings.toolbar">
          <template #actions>
            <el-checkbox v-model="state.custom.manualSave">展示自定义提交按钮</el-checkbox>
            <el-button
              v-if="state.custom.manualSave"
              type="primary"
              :disabled="!state.canSave"
              :loading="state.busy"
              @click="actions.save()"
            >
              自定义提交
            </el-button>
          </template>
        </MyCrudFormToolbar>
      </template>
      <MyCrudFormFeedback v-bind="bindings.feedback" />
      <el-alert
        v-if="state.invalidReason"
        :title="state.invalidReason"
        type="error"
        :closable="false"
      />
      <el-skeleton v-if="state.phase === 'loading'" animated :rows="6" />
      <!-- 保持主表和子表端口挂载，读取/草稿等待时仅隐藏。 -->
      <div v-show="state.phase !== 'loading'">
        <el-alert
          title="定制布局使用客户 Mock；保存后进入定制详情，关闭返回客户列表。"
          type="info"
          :closable="false"
        />
        <MyCrudFormFields v-bind="bindings.fields">
          <template #default="{ field }">
            <el-card shadow="never">
              <template #header>客户身份</template>
              <MyFormField v-bind="field('customerName')" />
              <MyFormField v-bind="field('shortName')" />
              <MyFormField v-bind="field('customerType')" />
              <MyFormField v-bind="field('creditCode')" />
            </el-card>
            <el-card shadow="never">
              <template #header>区域与联系</template>
              <MyFormField v-bind="field('provinceId')" />
              <MyFormField v-bind="field('cityId')" />
              <MyFormField v-bind="field('districtId')" />
              <MyFormField v-bind="field('address')" />
              <MyFormField v-bind="field('phone')" />
              <MyFormField v-bind="field('remark')">
                <template #default="{ value, update, commit, readonly }">
                  <el-input
                    :model-value="value"
                    type="textarea"
                    :disabled="readonly"
                    @update:model-value="update"
                    @change="commit"
                  />
                  <el-button
                    :disabled="readonly"
                    @click="
                      update('定制页面备注');
                      commit();
                    "
                  >
                    填写备注模板
                  </el-button>
                </template>
              </MyFormField>
            </el-card>
          </template>
        </MyCrudFormFields>
        <el-card shadow="never">
          <template #header>联系人</template>
          <CustomerContacts :binding="contacts" />
        </el-card>
        <el-card shadow="never">
          <template #header>收货地址</template>
          <CustomerAddresses :binding="addresses" />
        </el-card>
      </div>
      <template #aside>
        <el-card shadow="never">
          <template #header>实时摘要</template>
          <p>客户：{{ state.model.customerName || "尚未填写" }}</p>
          <p>{{ state.custom.summary || "确认修改字段后显示变化说明" }}</p>
          <p>{{ state.dirty ? "存在未保存修改" : "内容未修改" }}</p>
          <el-text type="info">{{ state.saveDisabledReason }}</el-text>
        </el-card>
      </template>
      <template #footer>
        <el-checkbox v-model="state.custom.reviewed" :disabled="state.busy">已核对资料</el-checkbox>
      </template>
    </MyCrudLayout>
  </div>
</template>
<script setup lang="ts">
import MyCrudLayout from "@/components/business/crud/MyCrudLayout.vue";
import MyCrudFormToolbar from "@/components/business/crud/MyCrudFormToolbar.vue";
import MyCrudFormFeedback from "@/components/business/crud/MyCrudFormFeedback.vue";
import MyCrudFormFields from "@/components/business/crud/MyCrudFormFields.vue";
import MyFormField from "@/components/business/MyForm/MyFormField.vue";
import CustomerContacts from "@/pages/base/customer/children/contacts/CustomerContacts.vue";
import CustomerAddresses from "@/pages/base/customer/children/addresses/CustomerAddresses.vue";
import { useCrudView } from "@/composables/useCrudView";
import { customerModule } from "@/pages/base/customer/config";
import { useRouter } from "vue-router";

const router = useRouter();
const { state, actions, bindings } = useCrudView(customerModule, {
  view: "add",
  state: () => ({
    /** 自定义保存按钮示例，默认关闭。 */ manualSave: false,
    /** 人工核对状态，每次实例创建重新确认。 */ reviewed: false,
    /** 最近一次字段确认说明，不提交后端。 */ summary: "",
  }),
  navigation: {
    saved: async (id) => {
      await router.replace("/component-lab/custom-crud/detail/" + encodeURIComponent(id));
    },
  },
  hooks: {
    change: async ({ field, model }) => ({
      state: { summary: field + " 已确认；当前客户：" + model.customerName },
    }),
    beforeSave: async ({ state }) =>
      state.custom.reviewed ? { proceed: true } : { proceed: false, reason: "请先勾选已核对资料" },
  },
});
const contacts = bindings.child("contacts");
const addresses = bindings.child("addresses");
</script>
