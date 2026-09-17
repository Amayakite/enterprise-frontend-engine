<template>
  <MyCrudChildTable
    v-if="binding"
    :binding="binding"
    :fields="module.fields"
    :context="undefined"
    :get-row-key="module.getRowKey"
    :create-initial-row="() => module.createInitialRow(rows)"
    :normalize-rows="module.normalizeRows"
    :edit-presentation="module.editPresentation"
    :edit-dialog="module.editDialog"
    :edit-drawer="module.editDrawer"
  >
    <template #column-primary="{ row }">
      <el-tag v-if="binding.readonly && row.primary" size="small" effect="plain">主要</el-tag>
      <span v-else-if="binding.readonly">—</span>
      <el-radio
        v-else
        :model-value="primaryId"
        :value="row.id"
        :disabled="binding.busy"
        :aria-label="`设为主要联系人 ${row.name || '新联系人'}`"
        @change="setPrimary(row.id)"
      >
        <span class="sr-only">主要</span>
      </el-radio>
    </template>
    <template #empty><span class="customer-child-empty">暂无联系人，可按需添加</span></template>
  </MyCrudChildTable>
  <MyTable
    v-else
    :rows="rows"
    :fields="module.fields"
    :context="undefined"
    :get-row-key="module.getRowKey"
    :wrap-cells="true"
    height="auto"
  >
    <template #column-primary="{ row }">
      <el-tag v-if="row.primary" size="small" effect="plain">主要</el-tag>
      <span v-else>—</span>
    </template>
    <template #empty><span class="customer-child-empty">暂无联系人</span></template>
  </MyTable>
</template>

<script setup lang="ts">
import MyCrudChildTable from "@/components/business/crud/MyCrudChildTable.vue";
import MyTable from "@/components/table/MyTable.vue";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import type { CrudTableBinding } from "@/components/business/crud/types";
import type { CustomerContact } from "@/api/base/customer/types";
import { customerContactsConfig as module } from "./config";

const props = defineProps<{
  binding?: CrudTableBinding<CustomerContact>;
  rows?: readonly CustomerContact[];
}>();
const rows = computed(() =>
  props.binding
    ? cloneReadonlyModel<CustomerContact[]>(props.binding.rows)
    : (props.rows?.map((row) => ({ ...row })) ?? [])
);
const primaryId = computed(() => rows.value.find((row) => row.primary)?.id);
function setPrimary(id: string) {
  if (props.binding && !props.binding.readonly)
    props.binding.replace(module.actions.setPrimary(rows.value, id));
}
</script>

<style scoped>
.customer-child-empty {
  color: var(--el-text-color-secondary);
}
</style>
