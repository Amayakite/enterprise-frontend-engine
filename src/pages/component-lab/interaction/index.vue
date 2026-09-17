<template>
  <div class="page-container overflow-auto">
    <el-alert
      title="S2 独立验收：查询结果来自开发 Mock；字段和子表使用公共组件，不依赖客户专属样式。"
      type="info"
      :closable="false"
    />
    <el-card shadow="never">
      <el-tabs>
        <el-tab-pane label="组合查询"><QueryInteractionDemo /></el-tab-pane>
        <el-tab-pane label="字段与子表" lazy><FieldInteractionDemo /></el-tab-pane>
        <el-tab-pane label="客户与费用接口" lazy><ApiQueryExamples /></el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>
<script setup lang="ts">
import QueryInteractionDemo from "./QueryInteractionDemo.vue";
import FieldInteractionDemo from "./FieldInteractionDemo.vue";
import ApiQueryExamples from "./ApiQueryExamples.vue";
</script>
