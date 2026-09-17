<template>
  <div class="my-desc" :class="`my-desc--${density ?? 'compact'}`">
    <el-descriptions
      v-for="(group, index) in groups"
      :key="index"
      :title="group.title"
      :column="narrow ? 1 : (columns ?? 2)"
      border
    >
      <el-descriptions-item
        v-for="entry in group.entries"
        :key="entry.field.key"
        :label="entry.field.label"
        :span="narrow ? 1 : Math.min(entry.detail.span, columns ?? 2)"
      >
        <template #label>
          <FieldLabel
            :label="entry.field.label"
            :help="fieldHelpText(entry.field, environment, true)"
          />
        </template>
        <slot
          :name="fieldSlotName(entry.field.key)"
          :value="modelValue[entry.field.key]"
          :field="entry.field"
        >
          <FieldDisplay :field="entry.field" :env="environment" />
        </slot>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts" generic="M extends object, C = undefined">
import FieldDisplay from "@/components/business/fields/FieldDisplay.vue";
import FieldLabel from "@/components/business/fields/FieldLabel.vue";
import { fieldHelpText } from "@/components/business/fields/presentation";
import { normalizeFields } from "@/components/business/fields/normalize";
import type {
  FieldDefinition,
  FieldEnvironment,
  FieldKey,
  FieldDensity,
} from "@/components/business/fields/types";
const props = defineProps<{
  /**
   * 用于详情展示的只读模型。
   * @example `<MyDesc :model-value="detail" ... />`
   */
  modelValue: M;
  /**
   * 字段定义；仅启用 detail 配置的字段会显示。
   * @example `<MyDesc :fields="config.fields" ... />`
   */
  fields: readonly FieldDefinition<M, C>[];
  /**
   * 字段格式化和动态显示所需的页面上下文。
   * @example `<MyDesc :context="pageContext" ... />`
   */
  context: C;
  /** 大屏详情列数。 */
  columns?: 1 | 2 | 3;
  /** 详情描述列表的显示密度。 */
  density?: FieldDensity;
}>();
const slots = defineSlots<{
  [K in FieldKey<M> as `field-${K}`]?: (props: {
    value: M[K];
    field: FieldDefinition<M, C>;
  }) => unknown;
}>();
const narrow = useMediaQuery("(max-width: 640px)");
const environment = computed<FieldEnvironment<M, C>>(() => ({
  model: props.modelValue,
  context: props.context,
  mode: "edit",
}));
const entries = computed(() =>
  normalizeFields(props.fields, environment.value, true).filter(
    (entry): entry is typeof entry & { detail: NonNullable<typeof entry.detail> } => !!entry.detail
  )
);
const groups = computed(() => {
  const result: { title: string; entries: typeof entries.value }[] = [];
  for (const entry of entries.value) {
    if (!result.length || entry.detail.group)
      result.push({ title: entry.detail.group, entries: [] });
    result[result.length - 1]!.entries.push(entry);
  }
  return result;
});
function fieldSlotName(key: string) {
  return `field-${key}` as Exclude<keyof typeof slots, "footer">;
}
</script>

<style scoped lang="scss">
.my-desc {
  display: flex;
  flex-direction: column;
  gap: 20px;

  :deep(.el-descriptions__label.el-descriptions__cell.is-bordered-label) {
    color: var(--el-text-color-regular);
    background: var(--el-color-primary-light-9);
  }
}
.my-desc--compact :deep(.el-descriptions__cell) {
  padding: 8px 12px;
}
.my-desc--comfortable :deep(.el-descriptions__cell) {
  padding: 14px 16px;
}
</style>
