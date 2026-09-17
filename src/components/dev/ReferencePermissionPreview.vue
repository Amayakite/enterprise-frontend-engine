<template>
  <div class="permission-preview" role="group" aria-label="开发权限预览">
    <span>开发权限预览</span>
    <el-select
      :model-value="mode"
      aria-label="权限场景"
      class="permission-preview__select"
      @update:model-value="change"
    >
      <el-option label="正常权限（登录结果）" value="normal" />
      <el-option label="无销售组织新增权限" value="sale" />
      <el-option label="无客户新增权限" value="customer" />
    </el-select>
    <el-button v-if="mode !== 'normal'" link @click="change('normal')">恢复权限</el-button>
    <small>仅本次前端预览；刷新恢复。选择后再点击参照的“前往新增”。</small>
  </div>
</template>
<script setup lang="ts">
import { useReferencePermissionPreview } from "./reference-permission-preview";
const { mode, change } = useReferencePermissionPreview();
</script>
<style scoped>
.permission-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  font-size: 13px;
}
.permission-preview__select {
  width: 220px;
}
.permission-preview small {
  color: var(--el-text-color-secondary);
}
</style>
