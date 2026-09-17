<template>
  <ErrorPage
    status-code="401"
    label="访问受限"
    :title="intent.title.value ? `无权查看${intent.title.value}` : '当前账号暂无访问权限'"
    description="如果你确认需要访问该页面，请联系管理员调整权限后再试"
    variant="locked"
  >
    <template #actions>
      <el-button v-if="intent.intent.value?.source" type="primary" @click="intent.back">
        返回{{ intent.intent.value.source.title }}
      </el-button>
      <span v-if="intent.error.value" role="status">{{ intent.error.value }}</span>
      <el-button type="primary" :icon="House" @click="goHome">返回首页</el-button>
      <el-button :icon="Back" @click="router.back()">返回上一页</el-button>
    </template>
  </ErrorPage>
</template>

<script setup lang="ts">
import { Back, House } from "@element-plus/icons-vue";
import ErrorPage from "./components/ErrorPage.vue";
import { usePageIntent } from "@/composables/usePageIntent";
const intent = usePageIntent();

defineOptions({ name: "Page401" });

const router = useRouter();

/**
 * 回到首页，避免继续停留在无权限路由
 */
function goHome() {
  router.push("/");
}
</script>
