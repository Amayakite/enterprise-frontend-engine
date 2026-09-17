<template>
  <div class="page-container">
    <el-alert
      title="S3 装配实验：Mock 仅在开发服务进程内保留，重启重置；真实后端尚未联调。"
      type="info"
      :closable="false"
    />
    <div class="page-toolbar">
      <div class="page-toolbar__left">
        <el-checkbox v-model="controls.failList">列表读取失败</el-checkbox>
        <el-checkbox v-model="controls.failSave">保存拒绝</el-checkbox>
        <el-checkbox v-model="controls.failSync">回填失败</el-checkbox>
        <el-checkbox v-model="controls.failAfterSave">后置失败</el-checkbox>
        <el-checkbox v-model="controls.delay">慢查询</el-checkbox>
      </div>
      <div class="page-toolbar__right">
        <el-button
          v-if="mode === 'form' && editor.state.model.lines.length > 10"
          :disabled="editor.busy || !!readonlyReason"
          @click="invalidateLastLine"
        >
          制造末页明细错误
        </el-button>
        <el-button
          v-if="mode === 'form'"
          :disabled="editor.busy"
          @click="
            editor.open({
              mode: 'edit',
              id: editor.state.target.mode === 'edit' && editor.state.target.id === 0 ? 1 : 0,
            })
          "
        >
          切换编辑 ID
        </el-button>
      </div>
    </div>
    <MyCrudList
      v-show="mode === 'list'"
      :config="config.list!"
      :controller="list"
      :context="context"
      :navigation="navigation"
      :scope-key="context.organizationId"
      :preference="{
        user: String(userStore.userInfo.userId ?? 'session'),
        module: config.key,
        version: '1',
      }"
    >
      <template #column-title="{ row }">
        <strong>{{ row.title }}</strong>
      </template>
      <template #column-status="{ value }">
        <el-tag :type="value === 'confirmed' ? 'success' : 'info'" size="small">
          {{ value === "confirmed" ? "已确认" : "草稿" }}
        </el-tag>
      </template>
      <template #toolbar-right><span class="text-sm">配置 + 公共 hook</span></template>
    </MyCrudList>
    <MyCrudForm
      v-if="mode === 'form'"
      :controller="editor"
      :fields="config.form!.fields"
      :sections="config.form!.sections"
      :context="context"
      :readonly-reason="readonlyReason"
      :entity-key="editor.state.target.mode === 'edit' ? editor.state.target.id : 'new'"
    >
      <template #field-note="{ value, update, readonly }">
        <el-input
          :model-value="value"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          :disabled="readonly"
          @update:model-value="update"
        />
      </template>
      <template #section-lines>
        <MyCrudChildTable
          :binding="lines"
          :fields="lineFields"
          :context="context"
          :get-row-key="lineKey"
          :create-initial-row="newLine"
        />
      </template>
    </MyCrudForm>
    <MyCrudDetail
      v-if="mode === 'detail'"
      :controller="detail"
      :fields="config.detail!.fields"
      :tabs="config.detail!.tabs"
      :actions="config.detail!.actions"
      :context="context"
      :back="navigation.close"
    >
      <template #actions>
        <el-button
          v-if="detail.state.id !== null"
          type="primary"
          :disabled="!!detail.busyActionKey || detail.state.phase !== 'ready'"
          @click="navigation.edit!(detail.state.id)"
        >
          编辑
        </el-button>
      </template>
      <template #tab-lines>
        <MyTable
          :rows="detailRows"
          :fields="lineFields"
          :context="context"
          :get-row-key="lineKey"
        />
      </template>
      <template #tab-audit>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="详情版本">
            {{ detail.state.entity?.version }}
          </el-descriptions-item>
          <el-descriptions-item label="保存方式">
            主表与全部明细组成同一负载；回执回填失败只重新读取。
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </MyCrudDetail>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useCrudList } from "@/composables/useCrudList";
import { useCrudForm } from "@/composables/useCrudForm";
import { useCrudDetail } from "@/composables/useCrudDetail";
import { useCrudTableChild } from "@/composables/useCrudTableChild";
import { useUserStore } from "@/stores/user";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import MyCrudList from "@/components/business/crud/MyCrudList.vue";
import MyCrudForm from "@/components/business/crud/MyCrudForm.vue";
import MyCrudDetail from "@/components/business/crud/MyCrudDetail.vue";
import MyCrudChildTable from "@/components/business/crud/MyCrudChildTable.vue";
import MyTable from "@/components/table/MyTable.vue";
import { createLabConfig, lineFields, newLine, lineKey } from "./config";
import type { CrudNavigation } from "@/components/business/crud/types";
import type { CrudLabLine, CrudLabScope } from "@/api/crud-lab/types";
import type { CrudLabControls } from "./types";
const userStore = useUserStore();
const mode = ref<"list" | "form" | "detail">("list");
const context = reactive<CrudLabScope>({ organizationId: "org-a" });
const controls = reactive<CrudLabControls>({
  failList: false,
  failSave: false,
  failSync: false,
  failAfterSave: false,
  delay: false,
});
const navigation: CrudNavigation<number> = {
  add: async () => {
    if (await editor.open({ mode: "add" })) mode.value = "form";
  },
  edit: async (id) => {
    const opened = editor.open({ mode: "edit", id });
    mode.value = "form";
    await opened;
  },
  detail: async (id) => {
    mode.value = "detail";
    await detail.load(id);
  },
  close: async () => {
    mode.value = "list";
    await list.refresh();
  },
};
const config = createLabConfig(navigation, controls);
const list = useCrudList(config.list!, () => context, { invalidationKey: config.key });
const editor = useCrudForm(config.form!, {
  context: () => context,
  navigation,
  invalidateViewKey: config.key,
});
const detail = useCrudDetail(config.detail!, () => context);
const lines = useCrudTableChild(editor, "lines");
const detailRows = computed(() =>
  cloneReadonlyModel<CrudLabLine[]>(detail.state.model?.lines ?? [])
);
const readonlyReason = computed(() => config.form!.readonlyReason?.(editor.state.model, context));
function invalidateLastLine() {
  const rows = cloneReadonlyModel<CrudLabLine[]>(editor.state.model.lines);
  if (rows.length) rows[rows.length - 1]!.name = "";
  editor.patch({ lines: rows });
}
</script>
