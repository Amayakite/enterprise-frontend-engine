<!-- 客户详情：读取生命周期、动作插槽、本地子表筛选和只读联系卡片。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" tone="error" />

    <MyCrudDetail v-if="!state.invalidReason" v-bind="bindings.detail">
      <template #actions>
        <ActionButton
          v-if="state.canEdit"
          label="编辑"
          tone="primary"
          :link="false"
          :disabled="state.busy || state.phase !== 'ready'"
          :disabled-reason="state.editReason"
          @click="onEdit"
        />
        <el-button :disabled="state.busy || !state.model" @click="openContactCard">
          联系卡片
        </el-button>
      </template>
      <template #tab-contacts>
        <el-input
          v-model="state.custom.contactKeyword"
          clearable
          placeholder="按姓名或电话筛选本客户联系人"
          aria-label="筛选本客户联系人"
        />
        <el-text type="info">
          匹配 {{ filteredContacts.length }} / {{ state.model?.contacts.length ?? 0 }} 位联系人
        </el-text>
        <CustomerContacts :rows="filteredContacts" />
      </template>
      <template #tab-addresses>
        <CustomerAddresses :rows="state.model?.addresses ?? []" />
      </template>
      <template #footer="{ state: detailState }">
        <div class="customer-detail-footer">
          <el-text v-if="detailState.model" type="info">
            记录版本：{{ detailState.entity?.version }}
          </el-text>
          <details v-if="state.notice">
            <summary>开发 Mock 说明</summary>
            <MyFeedback :message="state.notice" />
          </details>
        </div>
      </template>
    </MyCrudDetail>

    <MyDialog
      v-model="state.custom.cardOpen"
      title="客户联系卡片"
      width="560px"
      :show-confirm="false"
      cancel-text="关闭"
    >
      <el-descriptions v-if="state.model" :column="1" border>
        <el-descriptions-item label="客户">
          {{ state.model.customerName }}
        </el-descriptions-item>
        <el-descriptions-item label="联系电话">
          {{ state.model.phone || "未填写" }}
        </el-descriptions-item>
        <el-descriptions-item label="详细地址">
          {{ state.model.address || "未填写" }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else description="资料尚未加载，请关闭卡片后重试读取" />
    </MyDialog>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ActionButton from "@/components/business/ActionButton.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import CustomerAddresses from "./children/addresses/CustomerAddresses.vue";
import MyCrudDetail from "@/components/business/crud/MyCrudDetail.vue";
import MyDialog from "@/components/common/MyDialog.vue";
import CustomerContacts from "./children/contacts/CustomerContacts.vue";
import { useCrudView } from "@/composables/useCrudView";
import { customerModule } from "./config";

defineOptions({ name: "CustomerDetail" });
const { state, actions, bindings } = useCrudView(customerModule, {
  view: "detail",
  state: () => ({
    /** 当前联系人页签的本地筛选词；初始为空，不发后端请求。 */
    contactKeyword: "",
    /** 联系卡片显示开关，默认关闭，不复制实体模型。 */
    cardOpen: false,
    /** 本实例有效详情读取次数，默认 0，刷新成功后递增。 */
    loadCount: 0,
  }),
  hooks: {
    beforeOpen: async ({ signal }) => {
      signal.throwIfAborted();
      return { state: { cardOpen: false } };
    },
    afterOpen: async ({ signal }): Promise<void> => {
      signal.throwIfAborted();
      state.custom.loadCount += 1;
    },
  },
});

/** 使用已加载子行本地筛选，不改变主模型、子行顺序或整单 DTO。 */
const filteredContacts = computed(() => {
  const rows = state.model?.contacts ?? [];
  const keyword = state.custom.contactKeyword.trim().toLocaleLowerCase();
  return keyword
    ? rows.filter((row) =>
        [row.name, row.phone].some((value) => value.toLocaleLowerCase().includes(keyword))
      )
    : rows;
});

/** 动作插槽只打开本页卡片；沿用详情控制器的加载状态和数据。 */
function openContactCard() {
  if (!state.busy && state.model) state.custom.cardOpen = true;
}
/** 默认编辑入口继续复核公共权限和只读规则。 */
function onEdit() {
  return actions.edit();
}
</script>

<style scoped>
.customer-detail-footer {
  display: flex;
  align-items: start;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.customer-detail-footer summary {
  cursor: pointer;
  margin-bottom: 4px;
}
</style>
