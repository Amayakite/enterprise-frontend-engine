<template>
  <div class="table-lab">
    <el-alert
      title="M4 场景 C · 主子表整单保存"
      description="开发 Mock 回执不持久化。明细分页只影响显示，保存校验全部明细。"
      type="info"
      :closable="false"
    />
    <el-card>
      <div class="page-toolbar">
        <div class="page-toolbar__left">
          <el-button :disabled="saving" @click="loadExample">载入示例</el-button>
          <el-button :disabled="saving" @click="restore">恢复快照</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存整单</el-button>
          <el-switch v-model="failSave" :disabled="saving" active-text="模拟保存失败" />
        </div>
        <el-tag :type="dirty ? 'warning' : 'success'" data-testid="order-dirty">
          {{ dirty ? "有未保存修改" : "与快照一致" }}
        </el-tag>
      </div>
      <MyForm
        :key="entityVersion"
        ref="headerRef"
        v-model="order.header"
        :fields="headerFields"
        :context="context"
        mode="edit"
        :disabled="saving"
        :create-initial-model="createHeader"
      />
      <el-alert
        v-if="message"
        :title="message"
        :type="success ? 'success' : 'warning'"
        :closable="false"
        data-testid="order-status"
      />
    </el-card>
    <el-card>
      <div class="table-lab-add">
        <span>本次待加入商品</span>
        <MyReference
          v-model="pendingIds"
          :source="productSource"
          multiple
          :filters="context"
          :scope-key="context.organizationId"
          :disabled="saving"
          :max-selected="50"
          @commit="pendingProducts = [...$event.items]"
        />
        <el-button type="primary" :disabled="saving || !pendingProducts.length" @click="append">
          加入明细
        </el-button>
        <el-button :disabled="saving" @click="addBlank">新增空行</el-button>
      </div>
      <MyTable
        ref="tableRef"
        :rows="pageRows"
        :fields="lineFields"
        :get-row-key="rowKey"
        :context="context"
        :pagination="pagination"
        :sort="sort"
        :selection="{
          mode: 'multiple',
          keys: selectedKeys,
          preserveOnPageChange: preserveSelection,
        }"
        :edit="{ createInitialRow: createLine, links: lineLinks }"
        :height="370"
        :loading="saving"
        :summary="{ scope: 'all', text: `共 ${order.lines.length} 行，金额 ${totalAmount}` }"
        @page-change="changePage"
        @sort-change="changeSort"
        @selection-change="selectedKeys = $event.keys"
        @row-patch="applyRowPatch"
        @draft-change="hasDraft = $event"
      >
        <template #title><strong>商品明细</strong></template>
        <template #tools>
          <el-switch v-model="preserveSelection" :disabled="saving" active-text="跨页保留勾选" />
          <span>已选 {{ selectedKeys.length }} 行</span>
        </template>
        <template #actions="{ rowKey: key }">
          <el-button link type="danger" :disabled="saving" @click="remove(key)">删除</el-button>
        </template>
      </MyTable>
    </el-card>
    <el-collapse>
      <el-collapse-item title="模型与提交 DTO（实验观察）" name="data">
        <pre data-testid="order-model">{{ order }}</pre>
        <pre data-testid="order-payload">{{ payload }}</pre>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>
<script setup lang="ts">
import MyForm from "@/components/business/MyForm/index.vue";
import MyReference from "@/components/business/MyReference/index.vue";
import MyTable from "@/components/table/MyTable.vue";
import { productSource } from "@/pages/component-lab/reference/references";
import { cloneModel, sameModelValue } from "@/components/business/fields/model";
import { sumDecimals, toFixedDecimal } from "@/utils/decimal";
import { OrderLabAPI } from "@/api/order-lab";
import type { OrderLabPayload } from "@/api/order-lab/types";
import type { Product } from "@/api/reference-lab/types";
import type { MyFormExpose } from "@/components/business/fields/types";
import type { MyTableExpose, TableSort } from "@/components/table/types";
import { headerFields, lineFields, lineLinks } from "./fields";
import { createLine, appendProducts, hydrateOrder, toOrderPayload } from "./adapters";
import type { OrderHeader, OrderLine, OrderModel, OrderContext } from "./types";

defineOptions({ name: "TableLab" });
const createHeader = (): OrderHeader => ({ title: "", customerId: null });
const context = reactive<OrderContext>({ organizationId: "org-a" });
const order = ref<OrderModel>({ id: null, header: createHeader(), lines: [] });
const snapshot = ref(cloneModel(order.value));
const hasDraft = ref(false);
const dirty = computed(() => hasDraft.value || !sameModelValue(order.value, snapshot.value));
const entityVersion = ref(0);
const saving = ref(false);
const failSave = ref(false);
const success = ref(false);
const message = ref("");
const payload = ref<OrderLabPayload>();
const headerRef = ref<MyFormExpose<OrderHeader>>();
const tableRef = ref<MyTableExpose<OrderLine, string>>();
const pendingIds = ref<string[]>([]);
const pendingProducts = ref<Product[]>([]);
const selectedKeys = ref<string[]>([]);
const preserveSelection = ref(false);
const page = ref(1);
const pageSize = ref(10);
const sort = ref<TableSort<OrderLine> | null>(null);
const rowKey = (row: Readonly<OrderLine>) => row.clientKey;
const sortedRows = computed(() => {
  const current = sort.value;
  if (!current) return order.value.lines;
  return [...order.value.lines].sort((a, b) => {
    const left = a[current.key],
      right = b[current.key];
    const compared =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return compared * (current.order === "asc" ? 1 : -1);
  });
});
const pageRows = computed(() =>
  sortedRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
);
const pagination = computed(() => ({
  pageNum: page.value,
  pageSize: pageSize.value,
  total: order.value.lines.length,
}));
const totalAmount = computed(() =>
  toFixedDecimal(sumDecimals(order.value.lines.map((line) => line.amount)))
);
function changePage(value: { pageNum: number; pageSize: number }) {
  page.value = value.pageNum;
  pageSize.value = value.pageSize;
}
function changeSort(value: TableSort<OrderLine> | null) {
  sort.value = value;
  page.value = 1;
}
function applyRowPatch({ rowKey: key, changes }: { rowKey: string; changes: Partial<OrderLine> }) {
  order.value.lines = order.value.lines.map((row) =>
    row.clientKey === key ? { ...row, ...changes } : row
  );
}
function clearPending() {
  pendingIds.value = [];
  pendingProducts.value = [];
}
function append() {
  const before = order.value.lines.length;
  order.value.lines = appendProducts(order.value.lines, pendingProducts.value);
  message.value = `本次加入 ${order.value.lines.length - before} 行，重复商品已跳过`;
  success.value = true;
  clearPending();
}
async function addBlank() {
  if (!(await tableRef.value?.commitEdit())) return;
  const row = createLine();
  order.value.lines.push(row);
  sort.value = null;
  page.value = Math.ceil(order.value.lines.length / pageSize.value);
  await nextTick();
  await tableRef.value?.startEdit(row.clientKey, "productId");
}
function remove(key: string) {
  order.value.lines = order.value.lines.filter((row) => row.clientKey !== key);
  selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
  page.value = Math.min(
    page.value,
    Math.max(1, Math.ceil(order.value.lines.length / pageSize.value))
  );
}
function hydrate(model: OrderModel) {
  tableRef.value?.cancelEdit();
  order.value = cloneModel(model);
  snapshot.value = cloneModel(model);
  entityVersion.value++;
  page.value = 1;
  sort.value = null;
  selectedKeys.value = [];
  clearPending();
  message.value = "";
}
function loadExample() {
  hydrate({
    id: "example-order",
    header: { title: "商品采购演示", customerId: 0 },
    lines: Array.from({ length: 12 }, (_, index) => {
      const productIndex = index < 8 ? index * 2 : index * 2 + 2;
      return {
        ...createLine(),
        id: `example-line-${index}`,
        productId: productIndex === 0 ? "0" : `product-${productIndex}`,
        price: productIndex * 10,
        amount: productIndex * 10,
      };
    }),
  });
}
function restore() {
  hydrate(snapshot.value);
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  success.value = false;
  message.value = "正在校验全部明细…";
  try {
    if (!(await tableRef.value?.commitEdit())) {
      message.value = "活动行校验未通过，请修正后保存";
      return;
    }
    await nextTick();
    const [header, lines] = await Promise.all([
      headerRef.value?.validate(),
      tableRef.value?.validate(order.value.lines),
    ]);
    if (!header?.valid) {
      message.value = "主表校验未通过";
      if (header?.errors[0]) headerRef.value?.focusField(header.errors[0].field);
      return;
    }
    if (!order.value.lines.length) {
      message.value = "请至少添加一条明细";
      return;
    }
    if (!lines?.valid) {
      message.value = lines?.stale ? "校验期间数据变化，请重新保存" : "全部明细校验未通过";
      const first = lines?.errors[0];
      if (first) {
        page.value =
          Math.floor(
            sortedRows.value.findIndex((row) => row.clientKey === first.rowKey) / pageSize.value
          ) + 1;
        saving.value = false;
        await nextTick();
        await tableRef.value?.startEdit(first.rowKey, first.field);
        message.value += `：第 ${page.value} 页，${lineFields.find((field) => field.key === first.field)?.label ?? first.field}：${first.message}`;
      }
      return;
    }
    const ids = order.value.lines.map((line) => line.productId);
    if (new Set(ids).size !== ids.length) {
      message.value = "存在重复商品，请删除或修改重复行";
      return;
    }
    payload.value = toOrderPayload(order.value, context);
    const result = await OrderLabAPI.save(payload.value, failSave.value);
    hydrate(hydrateOrder(result));
    success.value = true;
    message.value = "Mock 回执成功，已刷新本地快照（不持久化）";
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : "保存失败，输入已保留";
  } finally {
    saving.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
onBeforeRouteLeave(async () => {
  if (saving.value) return false;
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm("尚有未保存修改，确定离开？", "未保存提示", { type: "warning" });
    return true;
  } catch {
    return false;
  }
});
</script>
<style scoped lang="scss">
.table-lab {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
  padding: var(--page-gap);
}
.table-lab-add {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  :deep(.my-reference) {
    width: min(420px, 100%);
  }
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
