<template>
  <span v-if="loading">解析中…</span>
  <span v-else-if="error" class="reference-display-error">
    {{ error }}
    <el-button link type="primary" @click="refresh">重试</el-button>
  </span>
  <span v-else-if="typeof label === 'string'">{{ label || "—" }}</span>
  <span v-else class="reference-display-items">
    <template v-for="(item, index) in label" :key="`${typeof item.id}:${item.id}`">
      <span v-if="index">、</span>
      <el-button
        v-if="item.target"
        link
        type="primary"
        :disabled="navigation.busy.value"
        :aria-label="`查看${item.label}`"
        @click.stop="navigation.open(item.target)"
      >
        {{ item.label }} ↗
      </el-button>
      <span v-else>{{ item.label }}</span>
    </template>
  </span>
  <span v-if="navigation.error.value" role="status">{{ navigation.error.value }}</span>
</template>
<script setup lang="ts">
import { shallowRef } from "vue";
import { createReferenceChannel } from "@/components/business/MyReference/request-channel";
import { useBusinessNavigation } from "@/composables/useBusinessNavigation";
import type { BusinessNavigationRequest } from "@/router/business-targets";
/** 单条已授权解析的参照呈现；导航不触发选择或写入。 */
interface DisplayItem {
  /** 保持原类型的稳定主键。 */
  id: string | number;
  /** 合法解析所得名称，不猜测失效记录信息。 */
  label: string;
  /** 可选查看目标；没有时呈现纯文本。 */
  target?: BusinessNavigationRequest;
}
const navigation = useBusinessNavigation();
import {
  referenceDisplayKey,
  createReferenceDisplayContext,
  type ReferenceDisplayContext,
} from "./reference-display";
const props = defineProps<{
  /**
   * 所属模型对象；对象引用变化时重新请求回显。
   * @example `<ReferenceDisplay :owner="row" ... />`
   */
  owner: object;
  /**
   * 本次回显请求的稳定身份；值变化时重新请求。
   * @example `<ReferenceDisplay request-key="customer:42" ... />`
   */
  requestKey: string;
  /**
   * 返回参照展示文本的异步函数。
   * @example `<ReferenceDisplay :load="({ signal }) => loadName(signal)" ... />`
   */
  load: (context: ReferenceDisplayContext) => Promise<string | readonly DisplayItem[]>;
}>();
const inherited = inject(referenceDisplayKey, undefined);
const context = inherited ?? createReferenceDisplayContext();
const channel = createReferenceChannel();
const loading = ref(false);
const label = shallowRef<string | readonly DisplayItem[]>("");
const error = ref("");
async function refresh() {
  const request = channel.start();
  loading.value = true;
  error.value = "";
  label.value = "";
  try {
    const result = await props.load(context);
    if (request.isCurrent()) label.value = result;
  } catch (cause) {
    if (request.isCurrent()) error.value = cause instanceof Error ? cause.message : "回显失败";
  } finally {
    if (request.isCurrent()) loading.value = false;
  }
}
watch([() => props.owner, () => props.requestKey, context.revision], refresh, { immediate: true });
onBeforeUnmount(() => {
  channel.cancel();
  if (!inherited) context.dispose();
});
</script>
<style scoped lang="scss">
.reference-display-items {
  display: inline;
}
.reference-display-error {
  color: var(--el-color-danger);
  white-space: normal;
}
</style>
