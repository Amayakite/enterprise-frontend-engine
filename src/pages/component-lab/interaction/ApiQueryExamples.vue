<template>
  <div class="flex flex-col gap-6">
    <el-alert
      title="两个真实模块的新查询方法；旧业务页面继续沿用原 GET 查询，S4 再迁移装配。"
      :closable="false"
    />
    <section>
      <h3>客户查询接口</h3>
      <MySearch
        mode="query"
        :schema="customerSchema"
        :model-value="customers.applied.value"
        scope-key="lab:org-a"
        :loading="customers.loading.value"
        @apply="
          (value, reason) => (reason === 'reset' ? customers.reset() : customers.apply(value))
        "
        @refresh="customers.refresh"
      />
      <el-alert
        v-if="customers.error.value"
        :title="customers.error.value"
        type="error"
        :closable="false"
      />
      <TableView
        :rows="customers.rows.value"
        :columns="customerColumns"
        :get-row-key="(row) => row.id"
        :height="260"
        :loading="customers.loading.value"
      />
      <Pagination
        :page="customers.pageNum.value"
        :limit="customers.pageSize.value"
        :total="customers.total.value"
        :disabled="customers.loading.value"
        @pagination="customers.setPage($event.page, $event.limit)"
      />
    </section>
    <section>
      <h3>任务费用查询接口</h3>
      <MySearch
        mode="query"
        :schema="feeSchema"
        :model-value="fees.applied.value"
        scope-key="lab:org-a"
        :loading="fees.loading.value"
        @apply="(value, reason) => (reason === 'reset' ? fees.reset() : fees.apply(value))"
        @refresh="fees.refresh"
      />
      <el-alert v-if="fees.error.value" :title="fees.error.value" type="error" :closable="false" />
      <TableView
        :rows="fees.rows.value"
        :columns="feeColumns"
        :get-row-key="(row) => row.id"
        :height="240"
        :loading="fees.loading.value"
      />
      <Pagination
        :page="fees.pageNum.value"
        :limit="fees.pageSize.value"
        :total="fees.total.value"
        :disabled="fees.loading.value"
        @pagination="fees.setPage($event.page, $event.limit)"
      />
    </section>
  </div>
</template>
<script setup lang="ts">
import MySearch from "@/components/business/MySearch.vue";
import TableView from "@/components/table/TableView.vue";
import Pagination from "@/components/common/Pagination.vue";
import CustomerAPI from "@/api/base/customer";
import FeeAPI from "@/api/task/fee";
import { toCustomerSearchRequest } from "@/api/base/customer/query";
import { feeQuerySchema, toFeeSearchRequest } from "@/api/task/fee/query";
import { createGeographyReference, createPartyReference } from "@/api/master-data/reference";
import { createQueryReference } from "@/components/business/search/reference";
import { withQueryInputs } from "@/components/business/search/model";
import type { QuerySchema } from "@/components/business/search/types";
import { useSearchQuery } from "@/composables/useSearchQuery";
// 独立查询组件示例，仅展示名称/省份，不依赖客户页面装配。
const customerSchema = withQueryInputs<QuerySchema>(
  {
    customerName: { label: "客户名称", kind: "text", entries: ["quick"], operators: ["contains"] },
    provinceId: {
      label: "省份",
      kind: "reference",
      valueType: "string",
      entries: ["normal", "advanced"],
      operators: ["eq", "in"],
    },
  } as const,
  {
    provinceId: createQueryReference({
      source: createGeographyReference("省份"),
      filters: () => ({ organizationId: "org-a", level: "province", parentId: null }) as const,
      scopeKey: () => "lab:org-a",
    }),
  }
);
const feeSchema = withQueryInputs(feeQuerySchema, {
  principalPartyId: createQueryReference({
    source: createPartyReference("委托方"),
    filters: () => ({ organizationId: "org-a", role: "principal" }) as const,
    scopeKey: () => "lab:org-a",
  }),
  providerPartyId: createQueryReference({
    source: createPartyReference("服务商"),
    filters: () => ({ organizationId: "org-a", role: "provider" }) as const,
    scopeKey: () => "lab:org-a",
  }),
});
const scope = () => ({ key: "lab:org-a", value: { organizationId: "org-a" } });
const customers = useSearchQuery({
  schema: customerSchema,
  scope,
  pageSize: 10,
  request: (query, { signal }) => CustomerAPI.search(toCustomerSearchRequest(query), signal),
});
const fees = useSearchQuery({
  schema: feeSchema,
  scope,
  pageSize: 10,
  request: (query, { signal }) => FeeAPI.search(toFeeSearchRequest(query), signal),
});
const customerColumns = [
  { key: "customerCode", label: "客户编码", width: 120 },
  { key: "customerName", label: "名称", minWidth: 200 },
  { key: "customerType", label: "类型", width: 130 },
  { key: "status", label: "状态", width: 120 },
  { key: "active", label: "启用", width: 90 },
] as const;
const feeColumns = [
  { key: "billCode", label: "单据编号", width: 150 },
  { key: "billDate", label: "日期", width: 120 },
  { key: "amount", label: "金额", width: 140 },
  { key: "status", label: "状态", width: 100 },
  { key: "remark", label: "备注", minWidth: 180 },
] as const;
onMounted(() => {
  void customers.refresh();
  void fees.refresh();
});
</script>
