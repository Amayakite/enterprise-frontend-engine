<!-- 客户列表：公共流程来自 config；仅保留本页批量规则和工具栏扩展。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.notice" :message="state.notice" />
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" tone="error" />

    <el-space wrap>
      <el-switch v-model="state.custom.showFullRegion" active-text="显示完整地区" />
      <el-text type="info">本页已完成 {{ state.custom.queryCount }} 次查询</el-text>
    </el-space>

    <MyCrudList v-if="!state.invalidReason" v-bind="bindings.list">
      <!-- 页面展示偏好放 state；不改变查询 DTO 或固定组织范围。 -->
      <!-- 真实列插槽：value、row 均来自当前行；原始字段与排序不变。 -->
      <template #column-cityName="{ row, value }">
        <span>
          {{
            state.custom.showFullRegion
              ? [row.provinceName, value, row.districtName].filter(Boolean).join(" / ") || "—"
              : value || "—"
          }}
        </span>
      </template>
      <template #toolbar-left>
        <ActionButton
          v-if="crudPermission('base:customer:update')"
          label="批量修改销售组织"
          :disabled="state.busy"
          :disabled-reason="selectedCustomers.length ? undefined : '请先勾选客户'"
          @click="openSaleDialog"
        />
        <router-link v-if="development" to="/component-lab/custom-crud/add">
          定制布局示例
        </router-link>
        <ActionButton
          label="查看选中客户"
          :icon="View"
          :disabled="state.busy"
          :disabled-reason="state.selectedKeys.length !== 1 ? '请先勾选一位客户' : undefined"
          @click="viewSelected"
        />
        <ActionButton
          label="选中客户摘要"
          :disabled="state.busy"
          :disabled-reason="state.selectedKeys.length ? undefined : '请先勾选客户'"
          @click="openSelectionSummary"
        />
      </template>
    </MyCrudList>

    <CustomerSaleDialog
      v-if="saleDialogOpen"
      v-model="saleDialogOpen"
      :customers="saleCustomers"
      :context="bindings.list.context"
      @saved="actions.refresh()"
    />

    <MyDialog
      v-model="state.custom.summaryOpen"
      title="选中客户摘要"
      width="620px"
      :show-confirm="false"
      cancel-text="关闭"
    >
      <el-empty v-if="!selectedCustomers.length" description="当前页没有选中的客户" />
      <el-descriptions
        v-for="row in selectedCustomers"
        :key="row.id"
        :title="row.customerName"
        :column="1"
        border
      >
        <el-descriptions-item label="客户编号">{{ row.customerCode }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ row.phone || "未填写" }}</el-descriptions-item>
      </el-descriptions>
    </MyDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import type { DeepReadonly } from "vue";
import CustomerSaleDialog from "./CustomerSaleDialog.vue";
import type { CustomerFormModel } from "./types";
import { crudPermission } from "@/composables/useCrudActions";
import MyDialog from "@/components/common/MyDialog.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { View, CircleClose, Delete } from "@element-plus/icons-vue";
import MyCrudList from "@/components/business/crud/MyCrudList.vue";
import ActionButton from "@/components/business/ActionButton.vue";
import { useCrudView } from "@/composables/useCrudView";
import { executeBatch } from "@/api/common/batch";
import { customerModule } from "./config";

const development = import.meta.env.DEV;
defineOptions({ name: "CustomerManagement" });
const { state, actions, bindings } = useCrudView(customerModule, {
  view: "list",
  state: () => ({
    /** 当前页地区列展示偏好，默认显示完整地区，不持久化。 */
    showFullRegion: true,
    /** 选择摘要弹窗开关，默认关闭；不进入查询 DTO。 */
    summaryOpen: false,
    /** 本实例有效查询成功次数，默认 0；不作为业务统计。 */
    queryCount: 0,
  }),
  hooks: {
    afterQuery: async ({ signal }): Promise<void> => {
      signal.throwIfAborted();
      state.custom.queryCount += 1;
    },
  },
  batch: {
    request: executeBatch,
    commands: [
      {
        key: "disable",
        label: "批量禁用",
        icon: CircleClose,
        permission: "base:customer:disable",
        allowQuery: true,
      },
      {
        key: "delete",
        label: "批量删除",
        icon: Delete,
        permission: "base:customer:delete",
        tone: "danger",
        allowQuery: true,
      },
    ],
  },
});

/**
 * 插槽扩展示例：通过公共选择状态打开详情，不读取表格私有实例或重新查询。
 * @returns 导航完成的 Promise；未选中唯一客户时不执行。
 */
async function viewSelected() {
  if (state.busy) return;
  const [id] = state.selectedKeys;
  if (state.selectedKeys.length === 1 && id !== undefined) await actions.navigation.detail?.(id);
}
/** 只取当前页已选行，使用 Set 避免每行重复遍历选中 ID。 */
const selectedCustomers = computed(() => {
  const selected = new Set(state.selectedKeys);
  return state.rows.filter((row) => selected.has(row.id));
});

/** 每次打开固定本次选中的客户，避免后台列表刷新改变弹窗编辑对象。 */
const saleCustomers = shallowRef<DeepReadonly<CustomerFormModel[]>>([]);
const saleDialogOpen = ref(false);
/** 工具栏入口只操作当前页勾选客户；组件挂载时创建独立副本。 */
function openSaleDialog() {
  if (state.busy || !selectedCustomers.value.length || !crudPermission("base:customer:update"))
    return;
  saleCustomers.value = selectedCustomers.value;
  saleDialogOpen.value = true;
}

/** 打开本页只读摘要，不额外查询，不持久化选中行副本。 */
function openSelectionSummary() {
  if (!state.busy && state.selectedKeys.length) state.custom.summaryOpen = true;
}
</script>
