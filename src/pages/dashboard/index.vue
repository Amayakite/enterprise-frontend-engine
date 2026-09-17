<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header><h1 class="workbench-title">工作台</h1></template>
      <p>欢迎，{{ userStore.userInfo.nickname || userStore.userInfo.username }}。</p>
      <p class="workbench-description">请从左侧菜单选择功能。</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "@/stores";
defineOptions({ name: "Dashboard" });
const userStore = useUserStore();
</script>

<style scoped>
.workbench-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
}
.workbench-description {
  color: var(--el-text-color-secondary);
}
</style>
