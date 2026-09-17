<template>
  <el-card shadow="never" class="multiple-reference-demo">
    <h2>M2 商品多选</h2>
    <p>快速候选直接增减；弹窗勾选跨页保留，确定才提交。每次提交都重新校验有效性。</p>
    <div class="demo-controls">
      <el-select v-model="organizationId" aria-label="商品组织">
        <el-option label="组织 A" value="org-a" />
        <el-option label="组织 B" value="org-b" />
      </el-select>
      <el-input-number
        v-model="maximum"
        :min="0"
        :precision="0"
        placeholder="不限数量"
        aria-label="最多选择数量"
      />
      <el-button @click="ids = ['0']">回显商品 0</el-button>
      <el-button @click="ids = ['product-2']">回显商品 2</el-button>
      <el-button @click="ids = ['0', 'product-2', 'missing']">回显部分不可用</el-button>
      <el-button @click="scheduleExternal">1.5 秒后替换商品</el-button>
      <el-button @click="validate">校验商品</el-button>
      <el-button @click="reference?.reload()">刷新商品</el-button>
      <el-checkbox v-model="slow">商品慢请求</el-checkbox>
      <el-checkbox v-model="guardSlow">商品慢守卫</el-checkbox>
      <el-checkbox v-model="failResolve">有效性请求失败</el-checkbox>
      <el-checkbox v-model="partialUnavailable">首项失效</el-checkbox>
      <el-checkbox v-model="duplicate">重复 ID 响应</el-checkbox>
    </div>
    <MyReference
      ref="reference"
      v-model="ids"
      multiple
      :source="source"
      :filters="filters"
      :scope-key="`lab:products:${organizationId}`"
      :max-selected="maximum ?? undefined"
      :before-open="guard"
      :before-commit="guard"
      @commit="onCommit"
    />
    <p data-testid="multiple-value">已提交 ID：{{ JSON.stringify(ids) }}</p>
    <p data-testid="multiple-commit">
      提交 {{ count }} 次；新增 {{ added }}；移除 {{ removed }}；原因 {{ reason }}
    </p>
    <p data-testid="multiple-resolve-count">批量回显调用 {{ resolveCalls }} 次</p>
    <p data-testid="multiple-validation" role="status">{{ validation }}</p>
  </el-card>
</template>
<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import { ProductLabAPI } from "@/api/reference-lab";
import type { Product, OrganizationId, OrganizationFilters } from "@/api/reference-lab/types";
import type {
  ReferenceSource,
  ReferenceExpose,
  ReferenceCommit,
} from "@/components/business/MyReference/types";
import { productSource } from "./references";
const ids = ref<string[]>([]),
  organizationId = ref<OrganizationId>("org-a"),
  maximum = ref<number>();
const slow = ref(false),
  guardSlow = ref(false),
  failResolve = ref(false),
  partialUnavailable = ref(false),
  duplicate = ref(false);
const filters = computed(() => ({ organizationId: organizationId.value }));
const reference = ref<ReferenceExpose>();
const count = ref(0),
  added = ref("[]"),
  removed = ref("[]"),
  reason = ref(""),
  resolveCalls = ref(0),
  validation = ref("");
const controls = () => ({
  delayMs: slow.value ? (1500 as const) : (50 as const),
  failResolve: failResolve.value,
  partialUnavailable: partialUnavailable.value,
  duplicate: duplicate.value,
});
const source: ReferenceSource<Product, string, OrganizationFilters> = {
  ...productSource,
  search: (query, context) => ProductLabAPI.search(query, context, controls()),
  resolve: (values, scope, context) => {
    resolveCalls.value++;
    return ProductLabAPI.resolve(values, scope, context, controls());
  },
};
function onCommit(payload: ReferenceCommit<Product, string, true>) {
  count.value++;
  added.value = JSON.stringify(payload.addedIds);
  removed.value = JSON.stringify(payload.removedIds);
  reason.value = payload.reason;
}
async function guard() {
  if (guardSlow.value) await new Promise((resolve) => setTimeout(resolve, 1500));
  return { allowed: true };
}
async function validate() {
  const result = await reference.value?.validateSelection();
  validation.value = result?.allowed ? "商品校验通过" : (result?.reason ?? "商品校验失败");
}
let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleExternal() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    ids.value = ["product-4"];
  }, 1500);
}
onBeforeUnmount(() => clearTimeout(timer));
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
