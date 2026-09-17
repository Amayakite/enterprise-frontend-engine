<template>
  <MyTable
    :rows="rows"
    :fields="lineFields"
    :get-row-key="getKey"
    :context="context"
    :edit="{ createInitialRow: createLine }"
  >
    <template #field-quantity="{ value, setValue }">
      <button @click="setValue(value + 1)">合法数量</button>
      <!-- @vue-expect-error 数量插槽保留 number 类型 -->
      <button @click="setValue('错误数量')">非法数量</button>
    </template>
    <template #column-productId="{ row, rowKey }">
      {{ row.productId }} {{ rowKey.toUpperCase() }}
    </template>
  </MyTable>
  <!-- @vue-expect-error getRowKey 推断为 string 后 selection 不接受数字键 -->
  <MyTable
    :rows="rows"
    :get-row-key="getKey"
    :context="context"
    :selection="{ mode: 'single', keys: [1] }"
  />
</template>
<script setup lang="ts">
import MyTable from "@/components/table/MyTable.vue";
import { lineFields } from "./fields";
import { createLine } from "./adapters";
import type { OrderLine, OrderContext } from "./types";
const rows: OrderLine[] = [];
const context: OrderContext = { organizationId: "org-a" };
const getKey = (row: Readonly<OrderLine>) => row.clientKey;
</script>
