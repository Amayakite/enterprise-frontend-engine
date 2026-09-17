<template>
  <span>{{ source.title }}{{ multiple ? "多选" : "单选" }}：{{ modelValue ?? "未选" }}</span>
</template>

<script
  setup
  lang="ts"
  generic="
    Row,
    Id extends ReferenceId,
    F extends ReferenceFilters,
    Multiple extends boolean = false
  "
>
import type {
  ReferenceSource,
  ReferenceId,
  ReferenceFilters,
  ReferenceValue,
} from "@/components/business/MyReference/types";

// 只验证 Vue 泛型与 v-model 推断，不提供参照交互，不作为正式组件自动导入。
defineProps<{
  source: ReferenceSource<Row, Id, F>;
  modelValue: ReferenceValue<NoInfer<Id>, NoInfer<Multiple>>;
  filters: NoInfer<F>;
  scopeKey: string;
  // 交集保留泛型推断，同时让 Vue 运行时生成 Boolean prop，支持裸 multiple 属性。
  multiple?: Multiple & boolean;
}>();
defineEmits<{ "update:modelValue": [value: ReferenceValue<Id, Multiple>] }>();
</script>
