<template>
  <!-- 表格单独负责展示；右侧字段直接编辑弹窗副本，取消不会改动列表原数据。 -->
  <MyDialog
    v-model="visible"
    title="批量修改销售组织"
    width="1200px"
    fill-height
    body-scroll="content"
    :before-close="() => !saving"
    :confirm-loading="saving"
    :confirm-disabled="!changedRows.length || uncertain"
    :confirm-text="`保存修改（${changedRows.length}）`"
    @confirm="save"
  >
    <div class="customer-sale-dialog">
      <div class="customer-sale-dialog__hint">
        <span>共 {{ rows.length }} 位客户 · 已修改 {{ changedRows.length }} 位</span>
        <span>右侧逐行选择销售组织；已审核客户需先撤销审核。</span>
      </div>
      <MyFeedback v-if="error" :message="error" tone="error" />
      <MyTable
        class="customer-sale-dialog__table"
        :rows="rows"
        :fields="fields"
        :columns="columns"
        :get-row-key="rowKey"
        :context="context"
        height="100%"
        :loading="saving"
        :wrap-cells="true"
      >
        <!-- 不启用行草稿：每个可编辑单元格始终显示参照，change 直接更新对应客户。 -->
        <template #column-saleId="{ row }">
          <FieldInput
            :field="saleField"
            :env="{ model: row, context, mode: 'edit' }"
            :readonly="saving || uncertain || row.status === 'approved'"
            @change="(value) => changeSale(row.id, value)"
          />
        </template>
      </MyTable>
    </div>
  </MyDialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import type { DeepReadonly } from "vue";
import { toTableColumns } from "@/components/table/columns";
import type { TableColumn } from "@/components/table/types";
import MyDialog from "@/components/common/MyDialog.vue";
import MyTable from "@/components/table/MyTable.vue";
import FieldInput from "@/components/business/fields/FieldInput.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { defineFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldDefinition } from "@/components/business/fields/types";
import { saleReference } from "@/pages/base/sale/references";
import CustomerAPI from "@/api/base/customer";
import type { CustomerFormModel, CustomerPageContext } from "./types";
import { crudPermission } from "@/composables/useCrudActions";
import { invalidateView } from "@/composables/useViewInvalidation";
import { notifyFeedback } from "@/utils/feedback";
import { classifyRequestSaveError } from "@/utils/request-error";

/** 本弹窗只保留展示、选组织及版本检查所需的字段，不复制联系人和地址。 */
type SaleRow = Pick<
  CustomerFormModel,
  "id" | "customerCode" | "customerName" | "phone" | "saleId" | "saleName" | "status" | "version"
>;
const props = defineProps<{
  /** 打开时选中的当前页客户；父页面每次打开重新挂载此组件，建立新的编辑副本。 */
  customers: DeepReadonly<CustomerFormModel[]>;
  /** 当前组织和身份范围，销售组织参照与提交使用同一范围。 */
  context: CustomerPageContext;
}>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{
  /** 保存成功后通知父页面刷新列表；关闭或取消不触发。 */
  saved: [];
}>();

/** 每次打开保存原组织 ID，用于计算真正需要提交的客户。 */
const initialSales = new Map(props.customers.map((row) => [row.id, row.saleId]));
/** 弹窗自己的平面数据副本；所有输入只修改这里，直到点击保存。 */
const rows = ref<SaleRow[]>(
  props.customers.map(
    ({ id, customerCode, customerName, phone, saleId, saleName, status, version }) => ({
      id,
      customerCode,
      customerName,
      phone,
      saleId,
      saleName,
      status,
      version,
    })
  )
);
/** 保存期间锁定输入和关闭，避免重复请求或丢失结果。 */
const saving = ref(false);
/** 请求结果未知时禁止重复提交，用户关闭后刷新列表核实。 */
const uncertain = ref(false);
/** 校验与接口错误保留在弹窗内，失败时保留当前选择。 */
const error = ref("");
/** 对照打开时的值计算改动数；改回原组织后自动从提交列表移除。 */
const changedRows = computed(() =>
  rows.value.filter((row) => row.saleId !== initialSales.get(row.id))
);
/** 稳定行标识，不用数组下标关联客户和参照。 */
const rowKey = (row: Readonly<SaleRow>) => row.id;

/** 普通 field 配置同时提供表头和输入控件；固定在右侧，横向滚动时仍可操作。 */
const saleField: FieldDefinition<SaleRow, CustomerPageContext> = {
  key: "saleId",
  label: "调整后销售组织",
  type: "reference",
  table: { width: 270 },
  placeholder: "选择销售组织",
  reference: createReferenceField<SaleRow, CustomerPageContext>()({
    source: saleReference,
    filters: ({ context }) => ({ organizationId: context.organizationId }),
    scopeKey: ({ context }) => context.scopeKey,
  }),
};
const fields = defineFields<SaleRow, CustomerPageContext>()([
  { key: "customerCode", label: "客户编号", type: "text", table: { width: 135 } },
  { key: "customerName", label: "客户名称", type: "text", table: { minWidth: 250 } },
  { key: "phone", label: "联系电话", type: "text", table: { width: 150 } },
  { key: "saleName", label: "原销售组织", type: "text", table: { width: 160 } },
  {
    key: "status",
    label: "审核状态",
    type: "text",
    table: { width: 115, format: (value) => (value === "approved" ? "已审核 · 只读" : "待审核") },
  },
  saleField,
]);
/** 小屏缩窄右侧输入列，为左侧客户信息和横向滚动保留空间。 */
const narrow = useMediaQuery("(max-width: 600px)");
/** 复用字段生成列，只为销售组织补充右固定位置，不重复声明整套列。 */
const columns = computed<TableColumn<SaleRow>[]>(() =>
  toTableColumns(fields).map((column) =>
    column.key === "saleId"
      ? { ...column, fixed: "right", width: narrow.value ? 200 : 270 }
      : column
  )
);

/** FieldInput 的 change 返回字段值；这里只接受销售组织 ID 或清空值。 */
function changeSale(id: SaleRow["id"], value: SaleRow[keyof SaleRow]) {
  if (saving.value || uncertain.value || (value !== null && typeof value !== "string")) return;
  const row = rows.value.find((row) => row.id === id);
  if (!row || row.status === "approved") return;
  row.saleId = value;
  error.value = "";
}

/** 只提交修改过的 ID、版本和新组织；不使用客户整单保存接口覆盖其他资料。 */
async function save() {
  if (saving.value || uncertain.value || !changedRows.value.length) return;
  if (!crudPermission("base:customer:update")) {
    error.value = "没有修改客户的权限";
    return;
  }
  const items = [];
  for (const row of changedRows.value) {
    if (!row.id || !row.saleId) {
      error.value = `请为${row.customerName}选择销售组织`;
      return;
    }
    items.push({ id: row.id, version: row.version, saleId: row.saleId });
  }
  saving.value = true;
  error.value = "";
  try {
    await CustomerAPI.changeSales(items, props.context.organizationId);
  } catch (cause) {
    uncertain.value = classifyRequestSaveError(cause) === "unknown";
    error.value = uncertain.value
      ? "提交结果待核实，请关闭弹窗并刷新列表后检查，暂不能重复提交。"
      : cause instanceof Error
        ? cause.message
        : "修改失败，请重试";
    return;
  } finally {
    saving.value = false;
  }
  // 写入已成功；后续列表刷新与保存分开，避免刷新失败被误认为未保存。
  invalidateView("customer");
  notifyFeedback("success", `已修改 ${items.length} 位客户的销售组织`);
  visible.value = false;
  emit("saved");
}
</script>

<style scoped>
.customer-sale-dialog {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.customer-sale-dialog__hint {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.customer-sale-dialog__table {
  flex: 1;
  min-height: 0;
}
</style>
