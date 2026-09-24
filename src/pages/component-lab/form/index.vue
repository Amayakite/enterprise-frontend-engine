<template>
  <div class="form-lab">
    <FilePreviewLab />
    <el-alert
      title="M3 场景 B · 字段、表单、查询与详情"
      description="参照沿用实验 Mock；保存仅展示 DTO，不代表后端持久化。"
      type="info"
      :closable="false"
    />
    <el-card>
      <div class="form-lab-toolbar">
        <el-button @click="newEntity">新增</el-button>
        <el-button @click="loadEntity">编辑 / hydrate</el-button>
        <el-button @click="formRef?.reset()">恢复实体快照</el-button>
        <el-switch v-model="readonly" active-text="只读" />
        <el-switch v-model="context.canEdit" active-text="标题编辑权限" />
        <el-switch v-model="context.showAttachments" active-text="显示附件" />
        <el-select v-model="context.organizationId" aria-label="组织" style="width: 140px">
          <el-option label="组织 A" value="org-a" />
          <el-option label="组织 B" value="org-b" />
        </el-select>
        <el-select v-model="context.dictCode" aria-label="字典编码" style="width: 140px">
          <el-option label="性别字典" value="gender" />
          <el-option label="通知等级" value="notice_level" />
        </el-select>
      </div>
      <MyForm
        ref="formRef"
        v-model="model"
        :fields="fields"
        :context="context"
        :mode="mode"
        :readonly="readonly"
        :links="links"
        :create-initial-model="createInitialModel"
        @patch="recordPatch"
      >
        <template #field-custom="{ value, setValue, readonly: fieldReadonly }">
          <span v-if="fieldReadonly">
            优先级 {{ value.priority }} · {{ value.tags.join("、") || "无标签" }}
          </span>
          <el-input-number
            v-else
            :model-value="value.priority"
            :min="0"
            :max="5"
            @update:model-value="(priority) => setValue({ ...value, priority: priority ?? 0 })"
          />
        </template>
        <template #footer>
          <el-button type="primary" :loading="validating" @click="save">校验并预览提交</el-button>
          <el-button @click="formRef?.focusField('title')">定位标题</el-button>
        </template>
      </MyForm>
      <el-text data-testid="patch-count">
        原子 patch：{{ patchCount }}；最近原因：{{ lastReason }}
      </el-text>
      <el-alert
        v-if="validationText"
        :title="validationText"
        :type="validationPassed ? 'success' : 'warning'"
        :closable="false"
      />
    </el-card>
    <el-card header="独立查询草稿">
      <MySearch
        :fields="searchFields"
        :context="context"
        :create-initial-query="createInitialQuery"
        @submit="query"
        @reset="query"
      />
      <p data-testid="query-count">查询次数：{{ queryCount }}</p>
      <pre data-testid="query-payload">{{ queryPayload }}</pre>
    </el-card>
    <el-card header="详情展示">
      <MyDesc :model-value="model" :fields="fields" :context="context">
        <template #field-custom="{ value }">
          优先级 {{ value.priority }} · {{ value.tags.join("、") || "无标签" }}
        </template>
      </MyDesc>
    </el-card>
    <el-card header="模型与 DTO（实验观察）">
      <pre data-testid="form-model">{{ model }}</pre>
      <pre data-testid="save-payload">{{ payload }}</pre>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import FilePreviewLab from "./FilePreviewLab.vue";
import MyForm from "@/components/business/MyForm/index.vue";
import MySearch from "@/components/business/MySearch.vue";
import MyDesc from "@/components/business/MyDesc.vue";
import type { FormPatch, MyFormExpose } from "@/components/business/fields/types";
import { fields, links, searchFields } from "./fields";
import { createInitialModel, createInitialQuery, toSavePayload, toQueryPayload } from "./adapters";
import type { FormLabModel, FormLabContext, FormLabQuery } from "./types";
defineOptions({ name: "FormLab" });
const model = ref(createInitialModel());
const formRef = ref<MyFormExpose<FormLabModel>>();
const context = reactive<FormLabContext>({
  organizationId: "org-a",
  canEdit: true,
  showAttachments: false,
  dictCode: "gender",
});
const readonly = ref(false);
const mode = ref<"add" | "edit">("add");
const patchCount = ref(0);
const lastReason = ref("未修改");
const validating = ref(false);
const validationText = ref("");
const validationPassed = ref(false);
const payload = ref<ReturnType<typeof toSavePayload>>();
const queryCount = ref(0);
const queryPayload = ref<ReturnType<typeof toQueryPayload>>();
function recordPatch(patch: FormPatch<FormLabModel>) {
  patchCount.value++;
  lastReason.value = patch.reason;
}
function newEntity() {
  mode.value = "add";
  formRef.value?.hydrate(createInitialModel());
}
function loadEntity() {
  mode.value = "edit";
  context.organizationId = "org-a";
  formRef.value?.hydrate({
    ...createInitialModel(),
    customerId: 0,
    customerName: "预带客户名称",
    contactId: "contact-0",
    contactName: "联系人 0",
    contactPhone: "13800000000",
    title: "已加载实体",
    amount: 0,
    enabled: false,
    date: "2026-09-09",
    month: "2026-09",
    year: "2026",
    period: ["2026-09-01", "2026-09-30"],
    custom: { priority: 2, tags: ["快照标签"] },
  });
}
async function save() {
  if (validating.value) return;
  validating.value = true;
  try {
    const result = await formRef.value!.validate();
    validationPassed.value = result.valid;
    validationText.value = result.stale
      ? "校验期间模型已变化，请重新校验"
      : result.valid
        ? "校验通过，已生成提交预览（未保存）"
        : result.errors.map((error) => error.message).join("；");
    if (result.valid) payload.value = toSavePayload(model.value);
  } finally {
    validating.value = false;
  }
}
function query(value: FormLabQuery) {
  queryCount.value++;
  queryPayload.value = toQueryPayload(value);
}
</script>

<style scoped lang="scss">
.form-lab {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
  padding: var(--page-gap);
  overflow: auto;
  height: 100%;
  > .el-card,
  > .el-alert {
    flex: none;
  }
  > .el-card :deep(.el-card__body) {
    flex: none;
    overflow: visible;
  }
}
.form-lab-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
}
</style>
