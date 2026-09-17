<template>
  <MyReference
    v-model="customerIds"
    multiple
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <MyReference
    v-model="productIds"
    multiple
    :source="productSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error M2 多选 source 仍决定 ID 类型 -->
  <MyReference
    v-model="productIds"
    multiple
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error M2 多选不接受 null -->
  <MyReference
    :model-value="null"
    multiple
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <MyReference v-model="customerId" :source="customerSource" :filters="filters" scope-key="lab:a" />
  <MyReference v-model="productId" :source="productSource" :filters="filters" scope-key="lab:a" />
  <!-- @vue-expect-error M1 单选不接受数组 -->
  <MyReference
    v-model="customerIds"
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error M1 source 决定 ID 类型 -->
  <MyReference v-model="productId" :source="customerSource" :filters="filters" scope-key="lab:a" />
  <!-- @vue-expect-error M2 多选不能绑定标量 -->
  <MyReference
    v-model="customerId"
    multiple
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error M1 filters 必须满足 source -->
  <MyReference v-model="customerId" :source="customerSource" :filters="{}" scope-key="lab:a" />
  <ReferenceTypeProbe
    v-model="customerId"
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <ReferenceTypeProbe
    v-model="customerIds"
    multiple
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <ReferenceTypeProbe
    v-model="productId"
    :source="productSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error 单选数组 -->
  <ReferenceTypeProbe
    v-model="customerIds"
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error 多选标量 -->
  <ReferenceTypeProbe
    v-model="customerId"
    multiple
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error source 的数值 ID 不可拓宽为 string -->
  <ReferenceTypeProbe
    v-model="productId"
    :source="customerSource"
    :filters="filters"
    scope-key="lab:a"
  />
  <!-- @vue-expect-error 缺少 organizationId -->
  <ReferenceTypeProbe
    v-model="customerId"
    :source="customerSource"
    :filters="{}"
    scope-key="lab:a"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import ReferenceTypeProbe from "./ReferenceTypeProbe.vue";
import { customerSource, productSource } from "./references";
import type { OrganizationFilters } from "@/api/reference-lab/types";

const customerId = ref<number | null>(0);
const customerIds = ref<number[]>([0]);
const productIds = ref<string[]>(["0"]);
const productId = ref<string | null>("0");
const filters: OrganizationFilters = { organizationId: "org-a" };
</script>
