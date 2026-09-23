<template>
  <details class="query-presets">
    <summary class="query-presets__summary">
      <el-icon><Collection /></el-icon>
      <span class="query-presets__title">查询方案</span>
      <span class="query-presets__current" :title="activeName">
        {{
          activeName || (controller.items.length ? `${controller.items.length} 个方案` : "未保存")
        }}
      </span>
      <el-icon class="query-presets__chevron"><ArrowRight /></el-icon>
    </summary>
    <div class="query-presets__content">
      <p v-if="!controller.items.length" class="query-presets__empty">
        将常用条件保存为方案，下次直接选择。
      </p>
      <div v-else class="query-presets__options" aria-label="已保存的查询方案">
        <button
          v-for="item in controller.items"
          :key="item.id"
          type="button"
          class="query-presets__option"
          :class="{ 'is-active': controller.activeId === item.id }"
          :aria-pressed="controller.activeId === item.id"
          :disabled="disabled || controller.busy || !!item.issue"
          :title="item.issue || item.name"
          @click="apply(item.id)"
        >
          <span class="query-presets__option-name">{{ item.name }}</span>
          <span v-if="item.issue" class="query-presets__badge">已失效</span>
          <span v-else-if="controller.defaultId === item.id" class="query-presets__badge">
            默认
          </span>
          <el-icon v-if="controller.activeId === item.id"><Check /></el-icon>
        </button>
      </div>
      <div class="query-presets__footer">
        <el-button link :icon="Plus" :disabled="disabled || controller.busy" @click="openSave">
          保存当前查询
        </el-button>
        <el-button link :icon="Setting" :disabled="controller.busy" @click="openManager">
          管理
        </el-button>
      </div>
    </div>
  </details>
  <MyDialog
    v-model="saving"
    title="保存查询方案"
    width="440px"
    :confirm-loading="controller.busy"
    @confirm="save"
  >
    <p class="query-presets__hint">保存已应用的筛选条件和排序；未应用的输入不会保存。</p>
    <el-input
      v-model="name"
      aria-label="查询方案名称"
      placeholder="例如：本月新增客户"
      maxlength="40"
      show-word-limit
      @keyup.enter="save"
    />
    <MyFeedback v-if="controller.error" :message="controller.error" tone="error" />
  </MyDialog>
  <MyDialog
    v-model="managing"
    title="管理查询方案"
    width="640px"
    :show-confirm="false"
    cancel-text="关闭"
  >
    <p class="query-presets__hint">默认方案会在下次进入当前列表时应用。{{ controller.notice }}</p>
    <MyFeedback v-if="controller.error" :message="controller.error" tone="error">
      <el-button link :disabled="controller.busy" @click="controller.reload">重试读取</el-button>
    </MyFeedback>
    <el-empty v-if="!controller.items.length" description="还没有保存的查询方案" :image-size="64" />
    <div v-for="item in controller.items" :key="item.id" class="query-presets__row">
      <div class="query-presets__label">
        <strong>{{ item.name }}</strong>
        <el-tag v-if="controller.defaultId === item.id" size="small">默认</el-tag>
        <small v-if="item.issue" class="query-presets__issue">{{ item.issue }}</small>
      </div>
      <div class="query-presets__actions">
        <el-button
          link
          :disabled="controller.busy || (!!item.issue && controller.defaultId !== item.id)"
          @click="controller.setDefault(controller.defaultId === item.id ? null : item.id)"
        >
          {{ controller.defaultId === item.id ? "取消默认" : "设为默认" }}
        </el-button>
        <el-button
          link
          :disabled="controller.busy"
          @click="
            renameId = item.id;
            renameName = item.name;
          "
        >
          重命名
        </el-button>
        <el-popconfirm title="删除这个查询方案？" @confirm="controller.remove(item.id)">
          <template #reference>
            <el-button link type="danger" :disabled="controller.busy">删除</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>
  </MyDialog>
  <MyDialog
    :model-value="!!renameId"
    title="重命名方案"
    width="440px"
    :confirm-loading="controller.busy"
    @update:model-value="
      (value) => {
        if (!value) renameId = '';
      }
    "
    @confirm="rename"
  >
    <el-input v-model="renameName" aria-label="新方案名称" maxlength="40" @keyup.enter="rename" />
    <MyFeedback v-if="controller.error" :message="controller.error" tone="error" />
  </MyDialog>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { Collection, ArrowRight, Check, Plus, Setting } from "@element-plus/icons-vue";
import MyDialog from "@/components/common/MyDialog.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import type { QueryPresetController } from "./query-presets";
const props = defineProps<{
  /** 列表控制器的本机方案端口；不由组件直接读取存储。 */
  controller: QueryPresetController;
  /** 列表请求/批量动作期间禁用保存和应用；默认 false。 */
  disabled?: boolean;
}>();
const emit = defineEmits<{
  /** 打开保存/管理窗口或成功应用方案时通知调用方关闭筛选弹层；不改变查询内容。 */
  navigate: [];
}>();
/** 保存方案窗口、方案管理窗口的开关，以及待保存方案名称；尚未确认时不写存储。 */
const saving = ref(false),
  managing = ref(false),
  name = ref("");
/** 当前正在重命名的方案 ID 和输入的新名称，确认后才更新方案。 */
const renameId = ref(""),
  renameName = ref("");
/** 从方案列表取得当前应用方案的名称，找不到时不显示旧标题。 */
const activeName = computed(
  () => props.controller.items.find((item) => item.id === props.controller.activeId)?.name
);
/** 打开保存方案窗口，并通知外层收起筛选菜单。 */
function openSave() {
  saving.value = true;
  emit("navigate");
}
/** 打开方案管理窗口，并通知外层收起筛选菜单。 */
function openManager() {
  managing.value = true;
  emit("navigate");
}
/** 应用选中方案，成功后关闭外层菜单；失败保留错误供用户处理。 */
async function apply(id: string) {
  if (await props.controller.apply(id)) emit("navigate");
}
/** 保存当前查询为命名方案，成功后关闭输入窗口并清空名称。 */
async function save() {
  if (props.disabled || props.controller.busy) return;
  if (await props.controller.save(name.value)) {
    saving.value = false;
    name.value = "";
  }
}
/** 提交方案的新名称，成功后结束这条方案的重命名状态。 */
async function rename() {
  if (await props.controller.rename(renameId.value, renameName.value)) renameId.value = "";
}
</script>
<style scoped>
.query-presets {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 8px;
  min-width: 0;
}
.query-presets__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  list-style: none;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.query-presets__summary::-webkit-details-marker {
  display: none;
}
.query-presets__summary:hover,
.query-presets__option:hover:not(:disabled) {
  background: var(--el-fill-color-light);
}
.query-presets__summary:focus-visible,
.query-presets__option:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.query-presets__title {
  flex-shrink: 0;
  font-weight: 500;
}
.query-presets__current {
  margin-left: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.query-presets[open] .query-presets__chevron {
  transform: rotate(90deg);
}
.query-presets__content {
  padding: 4px 8px 0;
}
.query-presets__options {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(224px, 35dvh);
  overflow-x: hidden;
  overflow-y: auto;
}
.query-presets__option {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--el-border-radius-base);
  background: transparent;
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.query-presets__option.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.query-presets__option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.query-presets__option-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.query-presets__badge {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.query-presets__empty {
  margin: 4px 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.query-presets__footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
  margin-top: 6px;
}
.query-presets__hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.query-presets__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.query-presets__label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.query-presets__issue {
  flex-basis: 100%;
  color: var(--el-color-danger);
}
.query-presets__actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
</style>
