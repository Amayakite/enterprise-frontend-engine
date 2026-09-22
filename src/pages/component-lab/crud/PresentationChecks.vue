<template>
  <details class="presentation-checks">
    <summary>页面打开与返回验收</summary>
    <p>复用客户和销售组织实际页面。保存仅写入开发 Mock；重启服务后数据恢复。</p>
    <div class="presentation-checks__controls">
      <el-select v-model="target" class="presentation-checks__field" aria-label="验收目标模块">
        <el-option label="销售组织 · 简单表单" value="sale" />
        <el-option label="客户 · 主子表" value="customer" />
      </el-select>
      <el-select v-model="mode" class="presentation-checks__field" aria-label="验收展示方式">
        <el-option label="继承模块配置" value="inherit" />
        <el-option label="标签页" value="tab" />
        <el-option label="弹窗" value="dialog" />
        <el-option label="抽屉" value="drawer" />
      </el-select>
      <el-input
        v-model="recordId"
        class="presentation-checks__field"
        aria-label="验收记录 ID"
        :placeholder="
          target === 'sale' ? '记录 ID，例如 sale-east（非编码）' : '记录 ID，例如 customer-001'
        "
      />
      <el-button :loading="opening" @click="open('add')">打开新增</el-button>
      <el-button :disabled="!recordId.trim() || opening" @click="open('edit')">打开编辑</el-button>
      <el-button :disabled="!recordId.trim() || opening" @click="open('detail')">
        打开详情
      </el-button>
    </div>
    <div class="presentation-checks__source">
      <el-input
        v-model="sourceText"
        aria-label="来源页保留内容"
        placeholder="输入内容，返回后检查是否保留"
      />
      <span role="status">{{ receipt || "尚未收到保存回执；取消不会回写" }}</span>
    </div>
    <MyFeedback v-if="error" :message="error" tone="error" />
    <ul>
      <li>
        来源保留：填写上方输入框，打开新增后取消，或保存并返回；来源内容应保留，保存回执只出现一次。
      </li>
      <li>
        容器差异：依次切换标签页、弹窗、抽屉；检查高度、抽屉单列、底部按钮与关闭前未保存提示。
      </li>
      <li>
        跨模块回写：打开客户新增，通过销售组织参照“前往新增”创建组织；应回到客户表单并带回新组织。
      </li>
      <li>
        故障恢复：下方勾选慢请求或失败后操作验收列表；观察加载、重试、保存回填失败，避免重复提交。
      </li>
    </ul>
  </details>
  <MyBusinessPageHost :presentation="presentation" />
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { useBusinessOpen } from "@/composables/useBusinessOpen";
import { useBusinessPresentation } from "@/composables/useBusinessPresentation";
import MyBusinessPageHost from "@/components/business/crud/MyBusinessPageHost.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import type {
  BusinessPresentationMode,
  BusinessView,
} from "@/components/business/crud/presentation";
const target = ref("sale");
const mode = ref<BusinessPresentationMode | "inherit">("inherit");
const recordId = ref(""),
  sourceText = ref(""),
  receipt = ref(""),
  error = ref("");
const opening = ref(false);
let count = 0;
const presentation = useBusinessPresentation("/component-lab/crud", "页面验收");
const { openBusiness } = useBusinessOpen(presentation);
watch(target, () => {
  recordId.value = "";
});
async function open(view: BusinessView) {
  opening.value = true;
  error.value = "";
  try {
    await openBusiness({
      target: target.value,
      view,
      id: view === "add" ? undefined : recordId.value.trim(),
      mode: mode.value === "inherit" ? undefined : mode.value,
      completion: "return-to-source",
      onSaved: async (id) => {
        recordId.value = id;
        receipt.value = `已收到 ${++count} 次回执，最近保存 ID：${id}`;
      },
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "打开页面失败";
  } finally {
    opening.value = false;
  }
}
</script>
<style scoped>
.presentation-checks {
  flex-shrink: 0;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.presentation-checks summary {
  cursor: pointer;
  font-weight: 600;
}
.presentation-checks p,
.presentation-checks li {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.presentation-checks__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.presentation-checks__field {
  width: 210px;
}
.presentation-checks__source {
  display: grid;
  grid-template-columns: minmax(160px, 360px) 1fr;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
  font-size: 13px;
}
@media (max-width: 640px) {
  .presentation-checks__source {
    grid-template-columns: 1fr;
  }
}
</style>
