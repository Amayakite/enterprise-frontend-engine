<template>
  <el-card shadow="never" class="single-reference-demo">
    <h1>M1 客户单选参照</h1>
    <p>输入搜索或打开完整弹窗。只有确认选择才回填地区；回显与取消不回填。以下数据来自 Mock。</p>
    <div class="demo-controls">
      <el-button @click="nestedVisible = true">嵌套弹窗键盘验证</el-button>
      <el-button @click="value = null">设为空值</el-button>
      <el-button @click="value = 0">回显 ID 0</el-button>
      <el-button @click="value = 16">回显停用记录</el-button>
      <el-button @click="value = 9999">回显缺失记录</el-button>
      <el-button @click="value = 4">回显长名称</el-button>
      <el-button @click="scheduleExternalUpdate">1.5 秒后外部改值</el-button>
      <el-button @click="validate">校验当前选择</el-button>
      <el-button @click="reference?.reload()">重新加载</el-button>
      <el-checkbox v-model="disabled">禁用</el-checkbox>
      <el-checkbox v-model="readonly">只读</el-checkbox>
      <el-checkbox v-model="fail">请求失败</el-checkbox>
      <el-checkbox v-model="empty">无结果</el-checkbox>
      <el-checkbox v-model="slow">慢请求</el-checkbox>
      <el-checkbox v-model="guardSlow">慢速守卫</el-checkbox>
      <el-checkbox v-model="guardDeny">守卫拒绝</el-checkbox>
    </div>
    <MyReference
      ref="reference"
      :model-value="value"
      :source="source"
      :filters="filters"
      scope-key="lab:single:org-a"
      :disabled="disabled"
      :readonly="readonly"
      :before-open="beforeOpen"
      :before-commit="beforeCommit"
      @update:model-value="onUpdate"
      @commit="onCommit"
      @resolve="onResolve"
    />
    <el-dialog
      v-model="nestedVisible"
      title="业务编辑弹窗"
      width="640px"
      style="max-width: calc(100vw - 32px)"
      destroy-on-close
    >
      <MyReference
        v-model="nestedValue"
        :source="source"
        :filters="filters"
        scope-key="lab:nested:org-a"
      />
      <template #footer>
        <el-button @click="nestedVisible = false">关闭业务弹窗</el-button>
      </template>
    </el-dialog>
    <p data-testid="single-value">
      当前 ID：{{ value === null ? "null" : value }}；业务地区：{{ region || "未回填" }}
    </p>
    <p data-testid="single-validation" role="status">{{ validation }}</p>
    <p data-testid="single-events">{{ eventLog.join(" → ") }}</p>
    <p data-testid="single-resolve">{{ resolved }}</p>
  </el-card>
</template>
<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import MyReference from "@/components/business/MyReference/index.vue";
import { CustomerLabAPI } from "@/api/reference-lab";
import type { Customer, OrganizationFilters } from "@/api/reference-lab/types";
import type {
  ReferenceSource,
  ReferenceExpose,
  ReferenceCommit,
  ReferenceResolveState,
} from "@/components/business/MyReference/types";
import { customerSource } from "./references";
const value = ref<number | null>(null);
const nestedVisible = ref(false);
const nestedValue = ref<number | null>(null);
const region = ref("");
const disabled = ref(false),
  readonly = ref(false),
  fail = ref(false),
  empty = ref(false),
  slow = ref(false),
  guardSlow = ref(false),
  guardDeny = ref(false);
const reference = ref<ReferenceExpose>();
const filters: OrganizationFilters = { organizationId: "org-a" };
const eventLog = ref<string[]>([]),
  validation = ref(""),
  resolved = ref("");
const controls = () => ({
  delayMs: slow.value ? (1500 as const) : (50 as const),
  fail: fail.value,
  empty: empty.value,
});
const source: ReferenceSource<Customer, number, OrganizationFilters> = {
  ...customerSource,
  search: (query, context) => CustomerLabAPI.search(query, context, controls()),
  resolve: (ids, scope, context) => CustomerLabAPI.resolve(ids, scope, context, controls()),
};
async function guard() {
  const deny = guardDeny.value;
  if (guardSlow.value) await new Promise((resolve) => setTimeout(resolve, 1500));
  return { allowed: !deny, reason: deny ? "演示业务条件未满足" : undefined };
}
const beforeOpen = guard,
  beforeCommit = guard;
function onUpdate(id: number | null) {
  eventLog.value.push(`update:${id}`);
  value.value = id;
}
function onCommit(payload: ReferenceCommit<Customer, number, false>) {
  eventLog.value.push(`commit:${payload.reason}`);
  region.value = payload.items[0]?.region ?? "";
}
function onResolve(payload: ReferenceResolveState<Customer, number>) {
  resolved.value = `回显：${payload.items.length}；不可用：${payload.unavailableIds.length}；待解析：${payload.pendingIds.length}`;
}
let externalTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleExternalUpdate() {
  clearTimeout(externalTimer);
  externalTimer = setTimeout(() => {
    value.value = value.value === 4 ? 2 : 4;
  }, 1500);
}
onBeforeUnmount(() => clearTimeout(externalTimer));
async function validate() {
  const result = await reference.value?.validateSelection();
  validation.value = result?.allowed ? "校验通过" : (result?.reason ?? "未通过");
}
</script>
<style scoped lang="scss">
.demo-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
