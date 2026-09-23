<template>
  <el-card shadow="never">
    <h2>参照导航与局部回写</h2>
    <ReferencePermissionPreview />
    <p>选择真实客户 Mock，点击 ↗ 查看详情；“前往新增客户”会进入客户列表并引导新增，不自动建单。</p>
    <el-input
      v-model="note"
      aria-label="导航来源备注"
      placeholder="输入备注后跳转，再返回检查保留"
    />
    <div class="navigation-demo-fields">
      <MyReference
        v-model="selected"
        :source="source"
        :filters="filters"
        :scope-key="scopeKey"
        :navigation="navigation"
      />
      <MyReference
        v-model="selectedMany"
        multiple
        :source="source"
        :filters="filters"
        :scope-key="scopeKey"
        :navigation="navigation"
      />
    </div>
    <p>页面局部回写示例位于客户 edit.vue 的 form.references；选择省份仅替换本实例的名称归一化。</p>
  </el-card>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import CustomerAPI from "@/api/base/customer";
import type { CustomerRecord } from "@/api/base/customer/types";
import type { ReferenceSource, ReferenceNavigation } from "@/components/business/MyReference/types";
import { useUserStore } from "@/stores/user";
import { createAccessScopeKey } from "@/utils/identity";
import { customerModule } from "@/pages/base/customer/config";
import { checkQuerySort } from "@/components/business/search/model";
import { customerSortKeys } from "@/api/base/customer/query";
import ReferencePermissionPreview from "@/components/dev/ReferencePermissionPreview.vue";
const customerList = customerModule.createViewConfig({}).list;
const note = ref("");
const selected = ref<string | null>(null);
const selectedMany = ref<string[]>([]);
const filters = { organizationId: "org-a" };
const user = useUserStore();
const scopeKey = computed(() =>
  createAccessScopeKey(
    "reference-navigation-demo",
    "org-a",
    user.userInfo.userId ?? "anonymous",
    user.userInfo.perms
  )
);
const navigation: ReferenceNavigation<CustomerRecord, string> = {
  create: "customer",
  view: (id) => ({ target: "customer", id }),
};
const source: ReferenceSource<CustomerRecord, string, typeof filters> = {
  key: "lab.real-customer-navigation",
  title: "客户",
  getKey: (row) => row.id,
  getLabel: (row) => row.customerName,
  getDescription: (row) => row.customerCode,
  columns: [
    { key: "customerCode", label: "编号", width: 140 },
    { key: "customerName", label: "客户名称", minWidth: 220 },
  ],
  query: {
    schema: customerList.query.schema,
    request: (query, context) =>
      CustomerAPI.search(
        customerList.toQuery(
          { ...query, sort: checkQuerySort(query.sort, customerSortKeys) },
          { organizationId: "org-a", scopeKey: query.scope.key }
        ),
        context.signal
      ),
  },
  search: (query, { signal }) =>
    CustomerAPI.search(
      customerList.toQuery(
        {
          scope: { key: scopeKey.value, value: query.filters },
          where: query.keyword.trim()
            ? {
                kind: "group",
                id: "keyword-group",
                operator: "and",
                children: [
                  {
                    kind: "condition",
                    id: "keyword",
                    field: "keyword",
                    operator: "contains",
                    value: query.keyword.trim(),
                  },
                ],
              }
            : null,
          pageNum: query.pageNum,
          pageSize: query.pageSize,
          sort: null,
        },
        { organizationId: "org-a", scopeKey: scopeKey.value }
      ),
      signal
    ),
  resolve: async (ids, _filters, { signal }) => ({
    items: await Promise.all(ids.map((id) => CustomerAPI.getDetail(id, signal))),
    unavailableIds: [],
  }),
  selectable: (row) => ({ allowed: row.active, reason: row.active ? undefined : "客户已停用" }),
};
</script>
<style scoped>
.navigation-demo-fields {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
</style>
