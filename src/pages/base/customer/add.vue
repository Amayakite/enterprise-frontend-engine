<!-- 客户新增：准备默认值与选项、条件校验、提交守卫，以及可编辑字段插槽。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" />

    <MyCrudForm v-if="!state.invalidReason" v-bind="bindings.form">
      <template #header>
        <details class="customer-example-options">
          <summary>开发示例选项与说明</summary>
          <div class="customer-example-options__body">
            <ReferencePermissionPreview v-if="ReferencePermissionPreview" />
            <MyFeedback v-if="state.notice" :message="state.notice" />

            <el-space wrap>
              <el-tag v-if="state.custom.initialized" type="success" effect="plain">
                资料已准备
              </el-tag>
              <el-checkbox v-model="state.custom.requirePhone">
                本次新增必须填写联系电话
              </el-checkbox>
            </el-space>
            <el-text class="customer-example-options__change-summary" type="info">
              {{ state.custom.changeSummary }}
            </el-text>
          </div>
        </details>
      </template>
      <!-- update 保留公共模型/脏状态/草稿流程；readonly 同时约束输入和模板按钮。 -->
      <template #field-remark="{ value, update, commit, readonly }">
        <el-input
          :model-value="value"
          type="textarea"
          :rows="4"
          :maxlength="500"
          show-word-limit
          :disabled="readonly"
          placeholder="客户背景、合作需求和跟进计划"
          @update:model-value="update"
          @change="commit"
        />
        <el-space wrap>
          <el-button
            v-for="item in state.custom.remarkTemplates"
            :key="item.label"
            link
            type="primary"
            :disabled="readonly"
            @click="applyRemarkTemplate(update, commit, item.content)"
          >
            替换为{{ item.label }}
          </el-button>
        </el-space>
      </template>
      <template #section-contacts>
        <CustomerContacts :binding="contacts" />
      </template>
      <template #section-addresses>
        <CustomerAddresses :binding="addresses" />
      </template>
      <template #footer="{ state: formState }">
        <el-space wrap>
          <el-checkbox v-model="state.custom.reviewed" :disabled="state.busy">
            我已核对客户资料
          </el-checkbox>
          <el-text type="info">
            联系人 {{ formState.model.contacts.length }} 位；地址
            {{ formState.model.addresses.length }} 处
          </el-text>
        </el-space>
      </template>
    </MyCrudForm>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from "vue";
const ReferencePermissionPreview = import.meta.env.DEV
  ? defineAsyncComponent(() => import("@/components/dev/ReferencePermissionPreview.vue"))
  : undefined;
import CustomerAddresses from "./children/addresses/CustomerAddresses.vue";
import CustomerContacts from "./children/contacts/CustomerContacts.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import { useCrudView } from "@/composables/useCrudView";
import type { CrudValidation } from "@/components/business/crud/types";
import type { CustomerFormModel } from "./types";
import { customerModule } from "./config";

/** 本页辅助状态；模型由 state.model 只读呈现，以下成员不进入 DTO 或草稿。 */
interface AddState {
  /** 最近一次已确认的字段调整说明；初始为空，不进入 DTO。 */
  changeSummary: string;
  /** 本次新增是否额外要求联系电话，默认 false。 */
  requirePhone: boolean;
  /** 提交前人工核对开关，默认 false；恢复草稿也需要重新核对。 */
  reviewed: boolean;
  /** afterOpen 已完成；等待草稿决定期间为 false。 */
  initialized: boolean;
  /** 本地备注模板，由 beforeOpen 准备；加载前为空数组。 */
  remarkTemplates: {
    /** 面向用户的模板名称，也是当前静态模板的唯一键。 */
    label: string;
    /** 点击后替换备注的纯文本；最多 500 字，与字段合同一致。 */
    content: string;
  }[];
}

defineOptions({ name: "CustomerAdd" });
const { state, bindings } = useCrudView(customerModule, {
  view: "add",
  state: (): AddState => ({
    changeSummary: "",
    requirePhone: false,
    reviewed: false,
    initialized: false,
    remarkTemplates: [],
  }),
  hooks: {
    // 已完成参照 ID/名称回填及同步 links；如需请求透传 signal，返回值由公共层防迟到。
    change: async ({ field, model, changes, reason, signal }) => {
      signal.throwIfAborted();
      if (reason !== "user") return;
      if (["provinceId", "cityId", "districtId"].includes(field)) {
        const region = [model.provinceName, model.cityName, model.districtName]
          .filter(Boolean)
          .join(" / ");
        return { state: { changeSummary: region ? "已选择地区：" + region : "已清空地区" } };
      }
      if (field === "remark" || field === "shortName") {
        return { state: { changeSummary: field === "remark" ? "备注已更新" : "客户简称已更新" } };
      }
      // 同步联动产生的实际变化字段也可通过 changes 判断，无需给每个字段建立 watch。
      if ("customerName" in changes)
        return { state: { changeSummary: "客户名称已更新：" + model.customerName } };
    },
    // 当前准备本地选项；以后接真实选项接口时透传 signal，不需要额外加载状态。
    beforeOpen: async ({ signal }) => {
      signal.throwIfAborted();
      return {
        state: {
          initialized: false,
          reviewed: false,
          remarkTemplates: [
            { label: "首次接洽模板", content: "合作需求：\n跟进计划：" },
            { label: "合作跟进模板", content: "合作进展：\n待确认事项：" },
          ],
        },
        // 公共层先应用新增初值，再检查草稿；此值不会覆盖恢复的备注。
        defaults: { remark: "合作需求：\n跟进计划：" },
      };
    },
    afterOpen: async ({ signal }): Promise<void> => {
      signal.throwIfAborted();
      state.custom.initialized = true;
    },
    validate: async ({ model, state }): Promise<CrudValidation<CustomerFormModel>> =>
      state.custom.requirePhone && !model.phone.trim()
        ? { valid: false, issues: [{ field: "phone", message: "本次新增要求填写联系电话" }] }
        : { valid: true },
    beforeSave: async ({ state }) =>
      state.custom.reviewed
        ? { proceed: true }
        : { proceed: false, reason: "请先勾选“我已核对客户资料”" },
  },
});
// 同一聚合绑定，不另建模型；组件源码与子表 config 均可直接跳转。
const contacts = bindings.child("contacts");
const addresses = bindings.child("addresses");
/** 模板按钮是一轮完整选择，先回写再确认；输入框则等待自身 change。 */
function applyRemarkTemplate(update: (value: string) => void, commit: () => void, content: string) {
  update(content);
  commit();
}
</script>
<style scoped>
.customer-example-options {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.customer-example-options summary {
  cursor: pointer;
  width: fit-content;
}
.customer-example-options__body {
  display: grid;
  gap: 12px;
  padding-top: 12px;
}
.customer-example-options__change-summary {
  display: block;
  min-height: 1.5em;
  line-height: 1.5;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
