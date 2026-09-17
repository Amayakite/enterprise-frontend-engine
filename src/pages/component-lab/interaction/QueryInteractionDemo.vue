<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center flex-wrap gap-3">
      <span>固定范围</span>
      <el-select v-model="organizationId" aria-label="固定组织" style="width: 120px">
        <el-option label="组织 A" value="org-a" />
        <el-option label="组织 B" value="org-b" />
      </el-select>
      <el-select v-model="fixedCustomer" aria-label="固定客户范围" style="width: 160px">
        <el-option label="组织内全部客户" :value="-1" />
        <el-option label="仅客户 ID 0" :value="0" />
      </el-select>
      <el-switch v-model="slow" active-text="延迟 1 秒" />
      <el-switch v-model="fail" active-text="查询故障" />
    </div>
    <MySearch
      mode="query"
      :schema="schema"
      :model-value="query.applied.value"
      :scope-key="query.scope.value.key"
      :loading="query.loading.value"
      @apply="apply"
      @refresh="query.refresh"
    />
    <el-alert v-if="query.error.value" :title="query.error.value" type="error" :closable="false" />
    <div class="flex items-center gap-2 flex-wrap">
      <el-text>匹配 {{ query.total.value }} 条 · 第 {{ query.pageNum.value }} 页</el-text>
      <el-button @click="query.setSort({ key: 'amount', order: 'asc' })">金额升序</el-button>
      <el-button @click="query.setSort({ key: 'id', order: 'asc' })">ID 升序</el-button>
    </div>
    <TableView
      :rows="query.rows.value"
      :columns="columns"
      :get-row-key="(row) => row.id"
      :height="360"
      :loading="query.loading.value"
    />
    <Pagination
      :page="query.pageNum.value"
      :limit="query.pageSize.value"
      :total="query.total.value"
      :disabled="query.loading.value"
      @pagination="query.setPage($event.page, $event.limit)"
    />
  </div>
</template>
<script setup lang="ts">
import MySearch from "@/components/business/MySearch.vue";
import TableView from "@/components/table/TableView.vue";
import Pagination from "@/components/common/Pagination.vue";
import QueryLabAPI from "@/api/query-lab";
import { queryLabSchema } from "@/api/query-lab/query";
import type { OrganizationId } from "@/api/reference-lab/types";
import type { AppliedQuery } from "@/components/business/search/types";
import { useSearchQuery } from "@/composables/useSearchQuery";
import { createQueryReference } from "@/components/business/search/reference";
import { withQueryInputs } from "@/components/business/search/model";
import { customerSource } from "@/pages/component-lab/reference/references";
const organizationId = ref<OrganizationId>("org-a");
const fixedCustomer = ref(-1),
  slow = ref(false),
  fail = ref(false);
const schema = withQueryInputs(queryLabSchema, {
  customerId: createQueryReference({
    source: customerSource,
    filters: () => ({ organizationId: organizationId.value }),
    scopeKey: () => organizationId.value,
  }),
});
const query = useSearchQuery({
  schema,
  pageSize: 10,
  initialSort: { key: "id", order: "asc" },
  scope: () => ({
    key: `${organizationId.value}:${fixedCustomer.value}`,
    value: {
      organizationId: organizationId.value,
      customerId: fixedCustomer.value === -1 ? null : fixedCustomer.value,
    },
  }),
  request: (value, { signal }) =>
    QueryLabAPI.search({ ...value, delayMs: slow.value ? 1000 : 0, fail: fail.value }, signal),
});
function apply(value: AppliedQuery<typeof schema>, reason: string) {
  return reason === "reset" ? query.reset() : query.apply(value);
}
const columns = [
  { key: "id", label: "ID", width: 80 },
  { key: "name", label: "名称", minWidth: 160 },
  { key: "gender", label: "字典值", width: 90 },
  { key: "active", label: "启用", width: 90 },
  { key: "billDate", label: "日期", width: 120 },
  { key: "amount", label: "精确金额", minWidth: 190 },
  { key: "customerId", label: "客户 ID", width: 110 },
  { key: "email", label: "邮箱", minWidth: 210 },
] as const;
onMounted(query.refresh);
</script>
