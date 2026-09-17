<!-- 客户编辑：保留服务端回显，演示辅助校验、字段快捷填写与子表分区扩展。 -->
<template>
  <div class="page-container crud-page">
    <MyFeedback v-if="state.invalidReason" :message="state.invalidReason" tone="error" />

    <MyCrudForm v-if="!state.invalidReason" v-bind="bindings.form">
      <template #header>
        <MyFeedback v-if="state.notice" :message="state.notice" />

        <el-space wrap>
          <el-text>本次载入版本：{{ state.custom.loadedVersion ?? "正在加载" }}</el-text>
          <el-checkbox v-model="state.custom.requireShortName">
            本次编辑必须填写客户简称
          </el-checkbox>
        </el-space>

        <el-text v-if="state.custom.changeSummary" type="info">
          {{ state.custom.changeSummary }}
        </el-text>
      </template>
      <template #field-shortName="{ model, value, update, commit, readonly }">
        <el-input
          :model-value="value"
          :maxlength="30"
          :disabled="readonly"
          placeholder="便于日常识别"
          @update:model-value="update"
          @change="commit"
        />
        <el-button
          link
          type="primary"
          :disabled="readonly || !model.customerName"
          @click="fillShortName(update, commit, model.customerName)"
        >
          采用客户名称前 30 字
        </el-button>
      </template>
      <!-- 明确引入真实子表组件，点击 import 可查看源码；同一 binding 保留整单保存。 -->
      <template #section-contacts>
        <el-text type="info">
          已登记 {{ state.model.contacts.length }} 位联系人，主要联系人规则由子表配置处理。
        </el-text>
        <CustomerContacts :binding="contacts" />
      </template>
      <template #section-addresses>
        <CustomerAddresses :binding="addresses" />
      </template>
      <template #footer="{ state: formState }">
        <el-space wrap>
          <el-tag :type="formState.dirty ? 'warning' : 'info'" effect="plain">
            {{ formState.dirty ? "有未保存修改" : "内容未修改" }}
          </el-tag>
          <el-text v-if="state.custom.lastSavedCode">
            最近保存：{{ state.custom.lastSavedCode }}
          </el-text>
        </el-space>
      </template>
    </MyCrudForm>
  </div>
</template>

<script setup lang="ts">
import CustomerAddresses from "./children/addresses/CustomerAddresses.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import CustomerContacts from "./children/contacts/CustomerContacts.vue";
import { useCrudView } from "@/composables/useCrudView";
import type { CrudValidation } from "@/components/business/crud/types";
import type { CustomerFormModel } from "./types";
import { customerModule } from "./config";
import { customerReferences } from "./references";

/** 编辑页辅助状态；不承担服务端版本提交或模型持久化。 */
interface EditState {
  /** 最近一次已确认的字段调整说明；初始为空，不进入 DTO。 */
  changeSummary: string;
  /** 本次额外要求简称，默认 false。 */
  requireShortName: boolean;
  /** 最近一次初始化的版本；null 表示尚未加载，不用于提交。 */
  loadedVersion: number | null;
  /** 保存成功回填的客户编号；默认空串。 */
  lastSavedCode: string;
}

defineOptions({ name: "CustomerEdit" });
const { state, bindings } = useCrudView(customerModule, {
  view: "edit",
  // 当前编辑实例的名称归一化；替换默认 map，仍沿用地区 links，不影响新增页。
  form: {
    references: {
      provinceId: customerReferences.province.withMap(({ items }) => ({
        provinceName: items[0]?.name.trim() ?? "",
      })),
    },
  },
  state: (): EditState => ({
    changeSummary: "",
    /** 本次编辑额外校验开关，默认 false，不改变共享字段规则。 */
    requireShortName: false,
    /** 本次回显的实体版本；null 表示尚未完成初始化，不用于提交版本。 */
    loadedVersion: null,
    /** afterSave 收到的客户编号；初始为空，不控制默认保存导航。 */
    lastSavedCode: "",
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
    // 编辑准备只能返回辅助 state，不通过 defaults 覆盖 API 回显。
    beforeOpen: async ({ signal }) => {
      signal.throwIfAborted();
      return { state: { loadedVersion: null, lastSavedCode: "" } };
    },
    afterOpen: async ({ baseline, signal }): Promise<void> => {
      signal.throwIfAborted();
      state.custom.loadedVersion = baseline?.version ?? null;
    },
    validate: async ({ model, state }): Promise<CrudValidation<CustomerFormModel>> =>
      state.custom.requireShortName && !model.shortName.trim()
        ? { valid: false, issues: [{ field: "shortName", message: "本次编辑要求填写客户简称" }] }
        : { valid: true },
    afterSave: async ({ entity, signal }): Promise<void> => {
      signal.throwIfAborted();
      state.custom.lastSavedCode = entity.customerCode;
      // 这里已提交并回填成功；随后仍执行原标签页/弹窗保存导航。
    },
  },
});
// 同一聚合绑定，不另建模型；组件源码与子表 config 均可直接跳转。
const contacts = bindings.child("contacts");
const addresses = bindings.child("addresses");
/** 快捷填写完成后显式确认，只发一次已完成变更。 */
function fillShortName(update: (value: string) => void, commit: () => void, name: string) {
  update(name.slice(0, 30));
  commit();
}
</script>
