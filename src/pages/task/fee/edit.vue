<template><FeeEditor :id="id" /></template>
<script setup lang="ts">
import FeeEditor from "./FeeEditor.vue";
defineOptions({ name: "TaskFeeEdit" });
const route = useRoute();
// KeepAlive 会同时保留多个 fullPath 实例；实体 ID 必须属于当前实例，不能持续读取全局 route。
const id = ref(typeof route.params.id === "string" ? route.params.id : "");
</script>
