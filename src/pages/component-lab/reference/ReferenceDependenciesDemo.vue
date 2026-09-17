<template>
  <el-card shadow="never" class="dependency-demo">
    <h2>M2 客户与联系人</h2>
    <p>编辑载入一次设置整份数据；客户提交后清空联系人及电话。演示数据来自 Mock。</p>
    <div class="demo-controls">
      <el-select
        :model-value="form.organizationId"
        aria-label="依赖场景组织"
        @update:model-value="changeOrganization"
      >
        <el-option label="组织 A" value="org-a" />
        <el-option label="组织 B" value="org-b" />
      </el-select>
      <el-button @click="hydrate">载入编辑数据</el-button>
      <el-button @click="externalCustomer">父级切换到客户 2</el-button>
      <el-checkbox v-model="slowContact">联系人慢请求</el-checkbox>
      <el-checkbox v-model="slowGuard">依赖慢守卫</el-checkbox>
    </div>
    <el-form label-position="top">
      <el-form-item label="客户">
        <MyReference
          :model-value="form.customerId"
          :source="customerSource"
          :filters="customerFilters"
          :scope-key="scope"
          :before-open="guard"
          :before-commit="guard"
          @commit="customerCommit"
        />
      </el-form-item>
      <el-form-item label="联系人">
        <MyReference
          :model-value="form.contactId"
          :source="contacts"
          :filters="contactFilters"
          :scope-key="scope"
          :disabled="form.customerId === null"
          :before-open="contactGuard"
          :before-commit="guard"
          @commit="contactCommit"
        />
        <small v-if="form.customerId === null">请先选择客户</small>
      </el-form-item>
    </el-form>
    <p data-testid="dependency-model">
      客户：{{ form.customerId ?? "null" }} / {{ form.customerName }}；联系人：{{
        form.contactId ?? "null"
      }}
      / {{ form.contactName }}；电话：{{ form.phone || "空" }}
    </p>
    <p data-testid="dependency-origin">数据来源：{{ origin }}；业务提交：{{ commits }}</p>
  </el-card>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import { ContactLabAPI } from "@/api/reference-lab";
import type { Customer, Contact, OrganizationId, ContactFilters } from "@/api/reference-lab/types";
import type { ReferenceCommit, ReferenceSource } from "@/components/business/MyReference/types";
import { customerSource, contactSource } from "./references";
interface DependencyForm {
  organizationId: OrganizationId;
  customerId: number | null;
  customerName: string;
  contactId: string | null;
  contactName: string;
  phone: string;
}
const emptyForm = (organizationId: OrganizationId): DependencyForm => ({
  organizationId,
  customerId: null,
  customerName: "",
  contactId: null,
  contactName: "",
  phone: "",
});
const form = ref<DependencyForm>(emptyForm("org-a"));
const origin = ref("empty"),
  commits = ref(0),
  slowContact = ref(false),
  slowGuard = ref(false);
const customerFilters = computed(() => ({ organizationId: form.value.organizationId }));
const contactFilters = computed(() => ({
  ...customerFilters.value,
  customerId: form.value.customerId,
}));
const scope = computed(() => `lab:dependencies:${form.value.organizationId}`);
const contacts: ReferenceSource<Contact, string, ContactFilters> = {
  ...contactSource,
  search: (query, context) =>
    ContactLabAPI.search(query, context, { delayMs: slowContact.value ? 1500 : 50 }),
  resolve: (ids, filters, context) =>
    ContactLabAPI.resolve(ids, filters, context, { delayMs: slowContact.value ? 1500 : 50 }),
};
function hydrate() {
  // 模拟编辑接口的一份 DTO；一次整体替换，不调用用户提交的依赖清理逻辑。
  form.value = {
    organizationId: "org-a",
    customerId: 0,
    customerName: "同名客户",
    contactId: "contact-0",
    contactName: "联系人 0",
    phone: "13800000000",
  };
  origin.value = "hydrate";
}
function customerCommit(payload: ReferenceCommit<Customer, number, false>) {
  form.value = {
    ...form.value,
    customerId: payload.value,
    customerName: payload.items[0]?.name ?? "",
    contactId: null,
    contactName: "",
    phone: "",
  };
  origin.value = payload.reason;
  commits.value++;
}
function contactCommit(payload: ReferenceCommit<Contact, string, false>) {
  form.value = {
    ...form.value,
    contactId: payload.value,
    contactName: payload.items[0]?.name ?? "",
    phone: payload.items[0]?.phone ?? "",
  };
  origin.value = payload.reason;
  commits.value++;
}
function changeOrganization(value: unknown) {
  if (value === "org-a" || value === "org-b") {
    form.value = emptyForm(value);
    origin.value = "organization";
  }
}
function externalCustomer() {
  form.value = { ...emptyForm("org-a"), customerId: 2, customerName: "同名客户" };
  origin.value = "external";
}
async function guard() {
  if (slowGuard.value) await new Promise((resolve) => setTimeout(resolve, 1500));
  return { allowed: true };
}
async function contactGuard() {
  return form.value.customerId === null ? { allowed: false, reason: "请先选择客户" } : guard();
}
</script>
<style scoped lang="scss">
.demo-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  :deep(.el-select) {
    width: 140px;
  }
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
