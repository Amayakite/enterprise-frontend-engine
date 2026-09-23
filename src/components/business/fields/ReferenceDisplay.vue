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
/** 单条已授权解析的参照显示；导航不触发选择或写入。 */
interface DisplayItem {
  /** 保持原类型的稳定主键。 */
  id: string | number;
  /** 合法解析所得名称，不猜测失效记录信息。 */
  label: string;
  /** 可选查看目标；没有时显示纯文本。 */
  target?: BusinessNavigationRequest;
}
/** 打开参照名称对应的详情目标，沿用项目统一跳转方式。 */
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
/** 优先使用表格提供的参照批量查询环境，减少每个单元格各自请求。 */
const inherited = inject(referenceDisplayKey, undefined);
/** 没有父级环境时创建本组件自己的环境；卸载时只释放自己创建的那份。 */
const context = inherited ?? createReferenceDisplayContext();
/** 给每次回显编号，只有最近一次请求能更新当前名称。 */
const channel = createReferenceChannel();
/** 名称正在解析时显示加载状态，避免把尚未返回误当作空值。 */
const loading = ref(false);
/** 保存解析后的纯文本或可点击名称列表，两种内容共用相同加载流程。 */
const label = shallowRef<string | readonly DisplayItem[]>("");
/** 回显失败的原因，显示重试入口，不把接口异常伪装成没有记录。 */
const error = ref("");
/** 清除旧名称并重新解析，只有仍有效的请求能写入名称、错误和加载状态。 */
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
/** 数据源、ID/范围标识或共享刷新版本改变后重新读取名称，首次挂载也会执行。 */
watch([() => props.owner, () => props.requestKey, context.revision], refresh, { immediate: true });
/** 作废本组件的回显；独立使用时同时释放自己创建的请求环境，保留父级共享环境。 */
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
